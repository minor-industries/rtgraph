package rtgraph

import (
	"fmt"
	"github.com/chrispappas/golang-generics-set/set"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

type Graph struct {
	db          *gorm.DB
	seriesNames []string
	errCh       chan error

	broker    *broker.Broker
	allSeries map[string]*database.Series
	server    *gin.Engine
}

func New(
	dbPath string,
	errCh chan error,
	seriesNames []string,
	computed []Computed,
) (*Graph, error) {
	db, err := database.Get(dbPath)
	if err != nil {
		return nil, errors.Wrap(err, "get database")
	}

	for _, c := range computed {
		seriesNames = append(seriesNames, c.Name())
	}

	allSeries, err := database.LoadAllSeries(db, seriesNames)
	if err != nil {
		return nil, errors.Wrap(err, "load series")
	}

	br := broker.NewBroker()

	server := gin.New()
	server.Use(gin.Recovery())
	skipLogging := []string{"/metrics"}
	server.Use(gin.LoggerWithWriter(gin.DefaultWriter, skipLogging...))

	g := &Graph{
		broker:    br,
		db:        db,
		allSeries: allSeries,
		errCh:     errCh,
		server:    server,
	}

	if err := g.setupServer(); err != nil {
		return nil, errors.Wrap(err, "setup server")
	}

	go g.publishPrometheusMetrics()
	go g.computeDerivedSeries(computed)
	go g.dbWriter()
	go br.Start()
	//go g.monitorDrops()

	return g, nil
}

// DB is temporary
func (g *Graph) DB() *gorm.DB {
	return g.db
}

func (g *Graph) GetEngine() *gin.Engine {
	return g.server
}

func (g *Graph) CreateValue(
	seriesName string,
	timestamp time.Time,
	value float64,
) error {
	series, ok := g.allSeries[seriesName]
	if !ok {
		return fmt.Errorf("unknown database series: %s", seriesName)
	}

	g.broker.Publish(&schema.Series{
		SeriesName: seriesName,
		Timestamp:  timestamp,
		Value:      value,
		SeriesID:   series.ID,
	})

	return nil
}

func floatP(v float32) *float32 {
	return &v
}

func (g *Graph) newSubscription(req *SubscriptionRequest) (*subscription, error) {
	positions := map[string]int{}

	var ids [][]byte
	for idx, sub := range req.Series {
		s, ok := g.allSeries[sub]
		if !ok {
			return nil, errors.New("unknown series")
		}
		positions[string(s.ID)] = idx + 1
		ids = append(ids, s.ID)
	}

	return &subscription{
		series:    req.Series,
		ids:       ids,
		positions: positions,
		lastSeen:  map[string]time.Time{},
		maxGap:    time.Millisecond * time.Duration(req.MaxGapMs),
	}, nil
}

func (g *Graph) getInitialData(
	sub *subscription,
	windowStart time.Time,
	lastPointMs uint64,
) (*messages.Data, error) {
	var data []database.Value
	var err error

	start := windowStart // by default
	if lastPointMs != 0 {
		tStartAfter := time.UnixMilli(int64(lastPointMs + 1))
		if tStartAfter.After(windowStart) {
			// only use if inside the start window
			start = tStartAfter
		}
	}

	data, err = database.LoadDataWindow(g.db, sub.ids, start)

	if err != nil {
		return nil, errors.Wrap(err, "load data")
	}

	rows := &messages.Data{Rows: []any{}}
	for _, d := range data {
		err := sub.packRow(rows, d.SeriesID, d.Timestamp, d.Value)
		if err != nil {
			return nil, err
		}
	}

	return rows, nil
}

func (g *Graph) Subscribe(
	req *SubscriptionRequest,
	now time.Time,
	callback func(data *messages.Data) error,
) {
	sub, err := g.newSubscription(req)
	if err != nil {
		panic(err) // TODO: return error to ws client and maybe log. Need to generate a msgpack message with an error field
	}

	windowSize := time.Duration(req.WindowSize) * time.Millisecond
	start := now.Add(-windowSize)

	initialData, err := g.getInitialData(sub, start, req.LastPointMs)
	if err != nil {
		panic(err) // TODO: return error to ws client and maybe log. Need to generate a msgpack message with an error field
	}

	err = callback(initialData)
	if err != nil {
		fmt.Println(errors.Wrap(err, "callback error"))
		return
	}

	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	allSeries := set.FromSlice(sub.series)
	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			if allSeries.Has(m.SeriesName) {
				data := &messages.Data{Rows: []interface{}{}}
				err := sub.packRow(data, database.HashedID(m.SeriesName), m.Timestamp, m.Value)
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
}

func (g *Graph) monitorDrops() {
	ticker := time.NewTicker(time.Second)

	for range ticker.C {
		fmt.Println("drops", g.broker.DropCount())
	}
}
