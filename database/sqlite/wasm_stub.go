//go:build wasm

package sqlite

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type Backend struct{}

func (d Backend) LoadDataWindow(seriesName string, start time.Time) (schema.Series, error) {
	panic("not implemented")
}

func (d Backend) LoadDate(seriesName string, date string) (schema.Series, error) {
	panic("not implemented")
}

func (d Backend) CreateSeries(seriesNames []string) error {
	panic("not implemented")
}

func (d Backend) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	panic("not implemented")
}

func Get(string) (Backend, error) {
	panic("not implemented")
}

type ORM struct{}

type TX struct {
	Error error
}

func (o ORM) Find(any) TX {
	panic("not implemented")
}

func (d Backend) RunWriter(chan error) error {
	panic("not implemented")
}

func (d Backend) GetORM() ORM {
	panic("not implemented")
}

func (d Backend) Save(any) ORM {
	panic("not implemented")
}

func (d Backend) Insert(any) ORM {
	panic("not implemented")
}
