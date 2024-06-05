package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type ComputedSeries struct {
	values   *deque.Deque[schema.Value]
	fcn      Fcn
	duration time.Duration
	start    time.Time // only produce values after start
}

func (cs *ComputedSeries) Lookback() time.Duration {
	return cs.duration
}

func NewComputedSeries(
	fcn Fcn,
	duration time.Duration,
	start time.Time,
) *ComputedSeries {
	cs := &ComputedSeries{
		values:   deque.New[schema.Value](0, 64),
		duration: duration,
		fcn:      fcn,
		start:    start,
	}

	return cs
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

func (cs *ComputedSeries) ProcessNewValues(
	values []schema.Value,
	now time.Time,
) []schema.Value {
	result := make([]schema.Value, 0, len(values))

	for _, v := range values {
		cs.fcn.AddValue(v)
		cs.values.PushBack(v)
		cs.removeOld(v.Timestamp)

		if v.Timestamp.Before(cs.start) {
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
