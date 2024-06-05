package rtgraph

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	subscription "github.com/minor-industries/rtgraph/subscription"
	"github.com/pkg/errors"
	"time"
)

type Graph struct {
	seriesNames []string
	errCh       chan error

	broker *broker.Broker
	server *gin.Engine
	db     storage.StorageBackend
}

type Opts struct {
	DisablePrometheusMetrics bool
}

func New(
	backend storage.StorageBackend,
	errCh chan error,
	opts Opts,
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
		broker: br,
		db:     backend,
		errCh:  errCh,
		server: server,
	}

	if err := g.setupServer(); err != nil {
		return nil, errors.Wrap(err, "setup server")
	}

	if !opts.DisablePrometheusMetrics {
		go g.publishPrometheusMetrics()
	}
	go g.publishToDB()
	go br.Start()
	//go g.monitorDrops()

	return g, nil
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
	})

	return nil
}

func (g *Graph) Subscribe(
	req *subscription.Request,
	now time.Time,
	msgCh chan *messages.Data,
) {
	start := req.Start(now)

	sub, err := subscription.NewSubscription(req, start)
	if err != nil {
		msgCh <- &messages.Data{
			Error: errors.Wrap(err, "new subscription").Error(),
		}
		return
	}

	sub.Run(
		g.db,
		g.broker,
		msgCh,
		now,
		start,
	)
}

func (g *Graph) monitorDrops() {
	ticker := time.NewTicker(time.Second)

	for range ticker.C {
		fmt.Println("drops", g.broker.DropCount())
	}
}
