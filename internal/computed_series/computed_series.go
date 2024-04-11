package computed_series

import (
	"fmt"
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
	"time"
)

type ComputedSeries struct {
	values          *deque.Deque[schema.Value]
	InputSeriesName string // TODO: make private?
	fcn             Fcn
	duration        time.Duration
}

func NewComputedSeries(inputSeriesName string, fcn Fcn, duration time.Duration) *ComputedSeries {
	cs := &ComputedSeries{
		values:          deque.New[schema.Value](0, 64),
		InputSeriesName: inputSeriesName,
		duration:        duration,
		fcn:             fcn,
	}

	return cs
}

func (cs *ComputedSeries) FunctionName() string {
	if cs.fcn == nil {
		return ""
	}
	return cs.fcn.Name()
}

func (cs *ComputedSeries) OutputSeriesName() string {
	if cs.fcn == nil {
		return cs.InputSeriesName
	}
	return fmt.Sprintf("%s_%s_%s", cs.InputSeriesName, cs.fcn.Name(), cs.duration.String())
}

func (cs *ComputedSeries) removeOld(now time.Time) {
	dt := -cs.duration
	cutoff := now.Add(dt)

	for {
		if cs.values.Len() == 0 {
			break
		}

		v := cs.values.Front()
		if v.Timestamp.Before(cutoff) {
			cs.fcn.RemoveValue(v)
			cs.values.PopFront()
		} else {
			break
		}
	}
}

func (cs *ComputedSeries) LoadInitial(
	db storage.StorageBackend,
	start time.Time,
) ([]schema.Value, error) {
	// TODO: LoadInitial could use some tests
	lookBack := -cs.duration
	window, err := db.LoadDataWindow(
		cs.InputSeriesName,
		start.Add(lookBack),
	)
	if err != nil {
		return nil, errors.Wrap(err, "load original window")
	}

	fmt.Printf("loaded %d rows for %s (%s)\n", len(window.Values), cs.OutputSeriesName(), cs.InputSeriesName)

	return cs.processNewValues(window.Values, start), nil
}

func (cs *ComputedSeries) processNewValues(
	values []schema.Value,
	start time.Time, // only produce values after start time
) []schema.Value {
	result := make([]schema.Value, 0, len(values))

	for _, v := range values {
		cs.fcn.AddValue(v)
		cs.values.PushBack(v)
		cs.removeOld(v.Timestamp)

		if v.Timestamp.Before(start) {
			continue
		}

		newValue, ok := cs.fcn.Compute(cs.values)
		if !ok {
			continue
		}

		result = append(result, schema.Value{
			Timestamp: v.Timestamp,
			Value:     newValue,
		})
	}

	return result
}

func (cs *ComputedSeries) ProcessNewValues(values []schema.Value) []schema.Value {
	return cs.processNewValues(values, time.Time{})
}
