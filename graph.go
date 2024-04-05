package rtgraph

import (
	"fmt"
	"github.com/chrispappas/golang-generics-set/set"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/database"
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
	computed map[string]ComputedReq
}

func New(
	backend storage.StorageBackend,
	errCh chan error,
	seriesNames []string,
	computed []ComputedReq,
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
		computed: map[string]ComputedReq{},
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

func floatP(v float32) *float32 {
	return &v
}

func (g *Graph) newSubscription(req *SubscriptionRequest) (*subscription, error) {
	positions := map[string]int{}

	for idx, seriesName := range req.Series {
		positions[seriesName] = idx + 1
	}

	return &subscription{
		seriesNames: req.Series,
		positions:   positions,
		lastSeen:    map[string]time.Time{},
		maxGap:      time.Millisecond * time.Duration(req.MaxGapMs),
	}, nil
}

func (g *Graph) getInitialData(
	sub *subscription,
	windowStart time.Time,
	lastPointMs uint64,
) (*messages.Data, error) {
	start := windowStart // by default
	if lastPointMs != 0 {
		tStartAfter := time.UnixMilli(int64(lastPointMs + 1))
		if tStartAfter.After(windowStart) {
			// only use if inside the start window
			start = tStartAfter
		}
	}

	allSeries := make([]schema.Series, len(sub.seriesNames))
	for idx, name := range sub.seriesNames {
		var err error
		allSeries[idx], err = g.db.LoadDataWindow(name, start)
		if err != nil {
			return nil, errors.Wrap(err, "load data window")
		}
	}

	rows := &messages.Data{Rows: []any{}}
	if err := interleave(allSeries, func(seriesName string, value schema.Value) error {
		// TODO: can we rewrite packRow so that it can't error?
		return sub.packRow(rows, seriesName, value.Timestamp, value.Value)
	}); err != nil {
		return nil, errors.Wrap(err, "interleave")
	}

	return rows, nil
}

func interleave(
	allSeries []schema.Series,
	f func(seriesName string, value schema.Value) error,
) error {
	// TODO: interleave could use some tests!
	indices := make([]int, len(allSeries))

	remaining := 0
	for _, s := range allSeries {
		remaining += len(s.Values)
	}

	for ; remaining > 0; remaining-- {
		found := 0
		var minT time.Time
		var minIdx int

		// this will be inefficient for a large number of series
		for i, s := range allSeries {
			j := indices[i]
			if j == len(s.Values) {
				continue
			}
			v := s.Values[j]
			if found == 0 || v.Timestamp.Before(minT) {
				minT = v.Timestamp
				minIdx = i
			}
			found++
		}

		minSeries := allSeries[minIdx]
		j := indices[minIdx]
		if err := f(minSeries.SeriesName, minSeries.Values[j]); err != nil {
			return err
		}
		indices[minIdx]++
	}

	return nil
}

func (g *Graph) Subscribe(
	req *SubscriptionRequest,
	now time.Time,
	callback func(data *messages.Data) error,
) {
	if err := callback(&messages.Data{
		Now: uint64(now.UnixMilli()),
	}); err != nil {
		fmt.Println(errors.Wrap(err, "callback error"))
		return
	}

	sub, err := g.newSubscription(req)
	if err != nil {
		_ = callback(&messages.Data{
			Error: errors.Wrap(err, "new subscription").Error(),
		})
		return
	}

	windowSize := time.Duration(req.WindowSize) * time.Millisecond
	start := now.Add(-windowSize)

	/*
		Need two things: initial, plus streaming
		Need a goroutine to produce values
	*/

	seriesCh := make(chan schema.Series)

	initialData, err := g.getInitialData(sub, start, req.LastPointMs)
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

	// TODO: need to close all these channels, etc

	go func() {
		allSeries := set.FromSlice(sub.seriesNames)
		msgCh := g.broker.Subscribe()
		defer g.broker.Unsubscribe(msgCh)

		for m := range msgCh {
			msg, ok := m.(schema.Series)
			if !ok {
				continue
			}

			if !allSeries.Has(msg.SeriesName) {
				continue
			}

			seriesCh <- msg
		}
	}()

	for series := range seriesCh {
		for _, v := range series.Values {
			data := &messages.Data{Rows: []interface{}{}}
			err := sub.packRow(data, series.SeriesName, v.Timestamp, v.Value)
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

func (g *Graph) monitorDrops() {
	ticker := time.NewTicker(time.Second)

	for range ticker.C {
		fmt.Println("drops", g.broker.DropCount())
	}
}
