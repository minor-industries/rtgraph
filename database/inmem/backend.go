package inmem

import (
	"github.com/minor-industries/rtgraph/schema"
	"sync"
	"time"
)

type Backend struct {
	lock   sync.Mutex
	values map[string][]schema.Value
}

func (b *Backend) LoadDate(seriesName string, date string) (schema.Series, error) {
	//TODO implement me
	panic("implement me")
}

func NewBackend() *Backend {
	return &Backend{
		values: map[string][]schema.Value{},
	}
}

func (b *Backend) LoadDataWindow(
	seriesName string,
	start time.Time,
) (schema.Series, error) {
	b.lock.Lock()
	defer b.lock.Unlock()

	var values []schema.Value
	for _, value := range b.values[seriesName] {
		if value.Timestamp.Before(start) {
			continue
		}
		values = append(values, value)
	}
	return schema.Series{
		SeriesName: seriesName,
		Values:     values,
	}, nil
}

func (b *Backend) CreateSeries(seriesNames []string) error {
	return nil
}

func (b *Backend) InsertValue(
	seriesName string,
	timestamp time.Time,
	value float64,
) error {
	b.lock.Lock()
	defer b.lock.Unlock()

	b.values[seriesName] = append(b.values[seriesName], schema.Value{
		Timestamp: timestamp,
		Value:     value,
	})
	return nil
}
