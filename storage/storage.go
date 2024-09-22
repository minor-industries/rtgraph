package storage

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type StorageBackend interface {
	LoadDataAfter(
		seriesName string,
		start time.Time,
	) (schema.Series, error)

	LoadDataBetween(
		seriesName string,
		start time.Time,
		end time.Time,
	) (schema.Series, error)

	CreateSeries(
		seriesNames []string,
	) error

	AllSeriesNames() ([]string, error)

	InsertValue(
		seriesName string,
		timestamp time.Time,
		value float64,
	) error
}
