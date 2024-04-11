package rtgraph

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/database"
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
}

func New(
	backend storage.StorageBackend,
	errCh chan error,
	seriesNames []string,
) (*Graph, error) {
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
	}

	if err := g.setupServer(); err != nil {
		return nil, errors.Wrap(err, "setup server")
	}

	go g.publishPrometheusMetrics()
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
	msgCh chan *messages.Data,
) {
	sub, err := subscription.NewSubscription(req, now)
	if err != nil {
		msgCh <- &messages.Data{
			Error: errors.Wrap(err, "new subscription").Error(),
		}
		return
	}

	sub.Run(
		g.db,
		g.broker,
		now,
		msgCh,
		req,
	)
}

func (g *Graph) monitorDrops() {
	ticker := time.NewTicker(time.Second)

	for range ticker.C {
		fmt.Println("drops", g.broker.DropCount())
	}
}
