//go:build wasm

package sqlite

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type Db struct{}

func (d Db) LoadDataWindow(seriesName string, start time.Time) (schema.Series, error) {
	panic("not implemented")
}

func (d Db) LoadDate(seriesName string, date string) (schema.Series, error) {
	panic("not implemented")
}

func (d Db) CreateSeries(seriesNames []string) error {
	panic("not implemented")
}

func (d Db) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	panic("not implemented")
}

func (d Db) RunWriter(chan error) error {
	panic("not implemented")
}

func Get(string) (Db, error) {
	panic("not implemented")
}
