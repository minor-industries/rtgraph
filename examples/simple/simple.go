package main

import (
	"github.com/minor-industries/rtgraph"
	"github.com/minor-industries/rtgraph/examples/simple/html"
	"github.com/pkg/errors"
	"math/rand"
	"os"
	"time"
)

func run() error {
	errCh := make(chan error)

	graph, err := rtgraph.New(
		os.ExpandEnv("$HOME/rtgraph-simple.db"),
		errCh,
		[]string{
			"sample",
		},
	)
	if err != nil {
		return errors.Wrap(err, "new graph")
	}

	graph.StaticFiles(html.FS, "index.html", "text/html")

	go func() {
		ticker := time.NewTicker(1000 * time.Millisecond)
		for range ticker.C {
			err := graph.CreateValue("sample", time.Now(), rand.Float64())
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
