package rtgraph

import (
	"container/list"
	"encoding/hex"
	"fmt"
	"github.com/chrispappas/golang-generics-set/set"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/platform/common/broker"
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

type subscription struct {
	series    []string
	ids       [][]byte
	positions map[string]int
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
	go g.computeDerivedSeries()

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

func (g *Graph) getPositionsAndIDs(subscribed []string) (*subscription, error) {
	positions := map[string]int{}

	var ids [][]byte
	for idx, sub := range subscribed {
		s, ok := g.allSeries[sub]
		if !ok {
			return nil, errors.New("unknown series")
		}
		positions[string(s.ID)] = idx + 1
		ids = append(ids, s.ID)
	}

	return &subscription{
		series:    subscribed,
		ids:       ids,
		positions: positions,
	}, nil
}

func (g *Graph) getInitialData(sub *subscription) (*messages.Data, error) {
	data, err := database.LoadData(g.db, sub.ids)
	if err != nil {
		return nil, errors.Wrap(err, "load data")
	}

	fmt.Println(sub.series)
	for s, i := range sub.positions {
		fmt.Println(hex.EncodeToString([]byte(s)), i)
	}

	//var t0 time.Time
	result := &messages.Data{Rows: []any{}}
	for _, d := range data {
		row, err := g.packRow(sub, d.SeriesID, d.Timestamp, d.Value)
		if err != nil {
			return nil, err
		}

		result.Rows = append(result.Rows, row)
	}

	return result, nil
}

func (g *Graph) packRow(
	sub *subscription,
	seriesID []byte,
	timestamp time.Time,
	value float64,
) ([]any, error) {
	//if idx > 0 && d.Timestamp.Sub(t0) > 1500*time.Millisecond {
	//	result.Rows = append(result.Rows, []any{
	//		d.Timestamp.UnixMilli(),
	//		floatP(float32(math.NaN())),
	//	})
	//}
	//t0 = d.Timestamp

	row := make([]any, len(sub.series)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.series); i++ {
		row[i+1] = nil
	}

	pos, ok := sub.positions[string(seriesID)]
	if !ok {
		return nil, fmt.Errorf("found value %s with unknown series", hex.EncodeToString(seriesID))
	}
	row[pos] = floatP(float32(value))
	return row, nil
}

func (g *Graph) Subscribe(
	series []string,
	callback func(data *messages.Data) error,
) {
	sub, err := g.getPositionsAndIDs(series)
	if err != nil {
		panic(err) // TODO: return error to ws client and maybe log. Need to generate a msgpack message with an error field
	}

	initialData, err := g.getInitialData(sub)
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
				row, err := g.packRow(
					sub,
					database.HashedID(m.SeriesName),
					m.Timestamp,
					m.Value,
				)
				if err != nil {
					panic(err) // TODO
				}
				resp := &messages.Data{Rows: []interface{}{row}}
				if err := callback(resp); err != nil {
					fmt.Println(errors.Wrap(err, "callback error"))
					return
				}
			}
		}
	}
}

func (g *Graph) computeDerivedSeries() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	values := list.New()

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			switch m.SeriesName {
			case "sample1":
				values.PushBack(m)
				removeOld(values, m.Timestamp.Add(-30*time.Second))
				avg, ok := computeAvg(values)
				if ok {
					fmt.Println("avg", avg)
					g.broker.Publish(&schema.Series{
						SeriesName: m.SeriesName + "_avg_30s",
						Timestamp:  m.Timestamp,
						Value:      avg,
					})
				}
			}
		}
	}
}

func removeOld(values *list.List, cutoff time.Time) {
	for {
		e := values.Front()
		v := e.Value.(*schema.Series)
		if v.Timestamp.Before(cutoff) {
			fmt.Println("remove", v.Timestamp)
			values.Remove(e)
		} else {
			break
		}
	}
}

func computeAvg(values *list.List) (float64, bool) {
	sum := 0.0
	count := 0
	for e := values.Front(); e != nil; e = e.Next() {
		v := e.Value.(*schema.Series)
		sum += v.Value
		count++
	}

	fmt.Println(count)

	if count > 0 {
		return sum / float64(count), true
	}

	return 0, false
}
