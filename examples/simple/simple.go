package main

import (
	"github.com/minor-industries/rtgraph"
	"github.com/minor-industries/rtgraph/computed_request"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/examples/simple/html"
	"github.com/pkg/errors"
	"io/fs"
	"math/rand"
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

	db, err := database.Get(dbPath)
	if err != nil {
		return errors.Wrap(err, "get database")
	}

	graph, err := rtgraph.New(
		&database.Backend{DB: db},
		errCh,
		[]string{
			"sample1",
			"sample2",
		},
		[]computed_request.ComputedReq{
			{
				SeriesName: "sample1",
				Function:   "avg",
				Seconds:    30,
			},
			{
				SeriesName: "sample2",
				Function:   "avg",
				Seconds:    90,
			},
		},
	)
	if err != nil {
		return errors.Wrap(err, "new graph")
	}

	graph.StaticFiles(html.FS, "index.html", "text/html")

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
		errCh <- graph.RunServer("0.0.0.0:8000")
	}()

	return <-errCh
}

func main() {
	if err := run(); err != nil {
		panic(err)
	}
}
