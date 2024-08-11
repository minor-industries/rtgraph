package main

import (
	"github.com/gin-gonic/gin"
	"github.com/minor-industries/rtgraph"
	"github.com/minor-industries/rtgraph/database/sqlite"
	"github.com/minor-industries/rtgraph/examples/simple/html"
	"github.com/minor-industries/rtgraph/prom"
	"github.com/pkg/errors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"io/fs"
	"math/rand"
	"net/http"
	"os"
	"syscall"
	"time"
)

func run() error {
	errCh := make(chan error)

	dbPath := os.ExpandEnv("$HOME/rtgraph-simple.db")

	if false {
		if err := os.Remove(dbPath); err != nil {
			var pathError *fs.PathError
			ok := errors.As(err, &pathError) && pathError.Err == syscall.ENOENT
			if !ok {
				return errors.Wrap(err, "remove db")
			}
		}
	}

	db, err := sqlite.Get(dbPath)
	if err != nil {
		return errors.Wrap(err, "get database")
	}

	go db.RunWriter(errCh)

	graph, err := rtgraph.New(
		db,
		errCh,
		rtgraph.Opts{
			ExternalMetrics: prom.PublishPrometheusMetrics,
		},
		[]string{
			"sample1",
			"sample2",
		},
	)
	if err != nil {
		return errors.Wrap(err, "new graph")
	}

	router := gin.New()
	router.Use(gin.Recovery())
	skipLogging := []string{"/metrics"}
	router.Use(gin.LoggerWithWriter(gin.DefaultWriter, skipLogging...))
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))
	router.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(204)
	})

	router.GET("/", func(c *gin.Context) {
		c.FileFromFS("main.html", http.FS(html.FS))
	})

	graph.SetupServer(router.Group("/rtgraph"))

	go func() {
		ticker := time.NewTicker(1000 * time.Millisecond)
		for range ticker.C {
			if rand.Float64() < 0.05 {
				continue
			}

			err := graph.CreateValue("sample1", time.Now(), rand.Float64())
			if err != nil {
				errCh <- errors.Wrap(err, "create value")
				return
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(1500 * time.Millisecond)
		for range ticker.C {
			if rand.Float64() < 0.05 {
				continue
			}

			err := graph.CreateValue("sample2", time.Now(), -rand.Float64())
			if err != nil {
				errCh <- errors.Wrap(err, "create value")
				return
			}
		}
	}()

	go func() {
		errCh <- router.Run("0.0.0.0:8000")
	}()

	return <-errCh
}

func main() {
	if err := run(); err != nil {
		panic(err)
	}
}
