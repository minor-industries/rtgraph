package main

import (
	"github.com/minor-industries/rtgraph"
	"github.com/pkg/errors"
	"os"
)

func run() error {
	errCh := make(chan error)

	graph, err := rtgraph.New(
		os.ExpandEnv("$HOME/rtgraph-simple.db"),
		errCh,
		[]string{
			"bike_instant_speed",
			"bike_instant_cadence",
			"bike_total_distance",
			"bike_resistance_level",
			"bike_instant_power",
			"bike_total_energy",
			"bike_energy_per_hour",
			"bike_energy_per_minute",
			"bike_heartrate",

			"rower_stroke_count",
			"rower_power",
			"rower_speed",
			"rower_spm",
		},
	)
	if err != nil {
		return errors.Wrap(err, "new graph")
	}

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
