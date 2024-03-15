package rtgraph

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/platform/common/broker"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"math"
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
) (*Graph, error) {
	db, err := database.Get(dbPath)
	if err != nil {
		return nil, errors.Wrap(err, "get database")
	}

	allSeries, err := database.LoadAllSeries(db, seriesNames)
	if err != nil {
		return nil, errors.Wrap(err, "load series")
	}

	br := broker.NewBroker()
	g := &Graph{
		broker:    br,
		db:        db,
		allSeries: allSeries,
		errCh:     errCh,
		server:    gin.Default(),
	}

	if err := g.setupServer(); err != nil {
		return nil, errors.Wrap(err, "setup server")
	}

	go br.Start()
	go g.publishPrometheusMetrics()

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

	tx := g.db.Create(&database.Value{
		ID:        database.RandomID(),
		Timestamp: timestamp,
		Value:     value,
		Series:    series,
	})
	if tx.Error != nil {
		return errors.Wrap(tx.Error, "create value")
	}

	g.broker.Publish(&schema.Series{
		SeriesName: seriesName,
		Timestamp:  timestamp,
		Value:      value,
	})

	return nil
}

func floatP(v float32) *float32 {
	return &v
}

func (g *Graph) GetInitialData(subscribed string) (
	*messages.Data,
	error,
) {
	s, ok := g.allSeries[subscribed]
	if !ok {
		return nil, errors.New("unknown series")
	}

	data, err := database.LoadData(g.db, s.ID)
	if err != nil {
		return nil, errors.Wrap(err, "load data")
	}

	var t0 time.Time
	newData := &messages.Data{Rows: []any{}}
	for idx, d := range data {
		if idx > 0 && d.Timestamp.Sub(t0) > 1500*time.Millisecond {
			newData.Rows = append(newData.Rows, []any{
				d.Timestamp.UnixMilli(),
				floatP(float32(math.NaN())),
			})
		}
		t0 = d.Timestamp

		newData.Rows = append(newData.Rows, []any{
			d.Timestamp.UnixMilli(),
			floatP(float32(d.Value)),
		})
	}

	return newData, nil
}

func (g *Graph) Subscribe(
	subscribed string,
	callback func(obj any) error,
) {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			if m.SeriesName == subscribed {
				newRows := [][2]any{{
					m.Timestamp.UnixMilli(),
					m.Value,
				}}
				resp := map[string]any{
					"rows": newRows,
				}
				if err := callback(resp); err != nil {
					fmt.Println(errors.Wrap(err, "callback error"))
					return
				}
			}
		}
	}
}
