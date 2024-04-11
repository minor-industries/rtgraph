package computed_series

import (
	"fmt"
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type ComputedSeries struct {
	values          *deque.Deque[schema.Value]
	InputSeriesName string // TODO: make private?
	fcn             Fcn
	duration        time.Duration
	start           time.Time // only produce values after start
}

func NewComputedSeries(
	inputSeriesName string,
	fcn Fcn,
	duration time.Duration,
	start time.Time,
) *ComputedSeries {
	cs := &ComputedSeries{
		values:          deque.New[schema.Value](0, 64),
		InputSeriesName: inputSeriesName,
		duration:        duration,
		fcn:             fcn,
		start:           start,
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

func (cs *ComputedSeries) ProcessNewValues(
	values []schema.Value,
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
