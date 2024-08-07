package storage

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type StorageBackend interface {
	LoadDataWindow(
		seriesName string,
		start time.Time,
	) (schema.Series, error)

	LoadDate(
		seriesName string,
		date string,
	) (schema.Series, error)

	CreateSeries(
		seriesNames []string,
	) error

	InsertValue(
		seriesName string,
		timestamp time.Time,
		value float64,
	) error
}
