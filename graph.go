package rtgraph

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/internal/computed_series"
	"github.com/minor-industries/rtgraph/internal/subscription"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
	"time"
)

type Graph struct {
	seriesNames []string
	errCh       chan error

	broker   *broker.Broker
	server   *gin.Engine
	dbWriter *database.DBWriter
	db       storage.StorageBackend
	computed map[string]computed_series.ComputedReq
}

func New(
	backend storage.StorageBackend,
	errCh chan error,
	seriesNames []string,
	computed []computed_series.ComputedReq,
) (*Graph, error) {
	for _, c := range computed {
		seriesNames = append(seriesNames, c.OutputSeriesName())
	}

	err := backend.CreateSeries(seriesNames)
	if err != nil {
		return nil, errors.Wrap(err, "load series")
	}

	br := broker.NewBroker()

	server := gin.New()
	server.Use(gin.Recovery())
	skipLogging := []string{"/metrics"}
	server.Use(gin.LoggerWithWriter(gin.DefaultWriter, skipLogging...))

	g := &Graph{
		broker:   br,
		db:       backend,
		errCh:    errCh,
		server:   server,
		dbWriter: database.NewDBWriter(backend, errCh, 100),
		computed: map[string]computed_series.ComputedReq{},
	}

	for _, req := range computed {
		g.computed[req.OutputSeriesName()] = req
	}

	if err := g.setupServer(); err != nil {
		return nil, errors.Wrap(err, "setup server")
	}

	go g.publishPrometheusMetrics()
	//go g.computeDerivedSeries(backend, errCh, computed)
	go g.dbWriter.Run()
	go g.publishToDB()
	go br.Start()
	//go g.monitorDrops()

	return g, nil
}

func (g *Graph) DBWriter() *database.DBWriter {
	return g.dbWriter
}

func (g *Graph) GetEngine() *gin.Engine {
	return g.server
}

func (g *Graph) CreateValue(
	seriesName string,
	timestamp time.Time,
	value float64,
) error {
	// TODO: do we need to ensure the series exists?

	g.broker.Publish(schema.Series{
		SeriesName: seriesName,
		Values: []schema.Value{{
			Timestamp: timestamp,
			Value:     value,
		}},
		Persisted: true,
	})

	return nil
}

func (g *Graph) Subscribe(
	req *subscription.SubscriptionRequest,
	now time.Time,
	callback func(data *messages.Data) error,
) {
	if err := callback(&messages.Data{
		Now: uint64(now.UnixMilli()),
	}); err != nil {
		fmt.Println(errors.Wrap(err, "callback error"))
		return
	}

	sub := subscription.NewSubscription(g.computed, req)

	windowSize := time.Duration(req.WindowSize) * time.Millisecond
	start := now.Add(-windowSize)

	initialData, err := sub.GetInitialData(g.db, start, req.LastPointMs)
	if err != nil {
		_ = callback(&messages.Data{
			Error: errors.Wrap(err, "get initial data").Error(),
		})
		return
	}

	err = callback(initialData)
	if err != nil {
		fmt.Println(errors.Wrap(err, "callback error"))
		return
	}

	seriesCh := make(chan schema.Series)
	// TODO: need to close all these channels, etc

	go func() {
		msgCh := g.broker.Subscribe()
		defer g.broker.Unsubscribe(msgCh)

		computedMap := sub.InputMap()

		for m := range msgCh {
			msg, ok := m.(schema.Series)
			if !ok {
				continue
			}

			if css, ok := computedMap[msg.SeriesName]; ok {
				computeAndPublishOutputSeries(css, msg, seriesCh)
			}

			if sub.AllSeries.Has(msg.SeriesName) {
				seriesCh <- msg
			}
		}
	}()

	for series := range seriesCh {
		for _, v := range series.Values {
			data := &messages.Data{Rows: []interface{}{}}
			// TODO: don't love how data is passed in here, can we return the row (or do something else)?
			err := sub.PackRow(data, series.SeriesName, v.Timestamp, v.Value)
			if err != nil {
				panic(err) // TODO
			}
			if err := callback(data); err != nil {
				fmt.Println(errors.Wrap(err, "callback error"))
				return
			}
		}
	}
}

func computeAndPublishOutputSeries(
	css []*computed_series.ComputedSeries,
	msg schema.Series,
	seriesCh chan schema.Series,
) {
	for _, cs := range css {
		for _, v := range msg.Values {
			value, ok := cs.ProcessNewValue(v)
			if !ok {
				continue
			}
			seriesCh <- schema.Series{
				SeriesName: cs.OutputSeriesName,
				Values: []schema.Value{{
					Timestamp: v.Timestamp,
					Value:     value,
				}},
				Persisted: false,
			}
		}
	}
}

func (g *Graph) monitorDrops() {
	ticker := time.NewTicker(time.Second)

	for range ticker.C {
		fmt.Println("drops", g.broker.DropCount())
	}
}
