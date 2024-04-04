package storage

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type StorageBackend interface {
	LoadDataWindow(
		seriesNames []string,
		start time.Time,
	) ([]schema.Series, error)

	CreateSeries(
		seriesNames []string,
	) error

	Insert(objects []any) error
}
