package computed_series

import (
	"container/list"
	"fmt"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
	"time"
)

type ComputedSeries struct {
	values          *list.List
	InputSeriesName string // TODO: make private?
	fcn             string
	duration        time.Duration
}

func NewComputedSeries(inputSeriesName string, fcn string, duration time.Duration) *ComputedSeries {
	cs := &ComputedSeries{
		values:          list.New(),
		InputSeriesName: inputSeriesName,
		duration:        duration,
		fcn:             fcn,
	}

	return cs
}

func (cs *ComputedSeries) FunctionName() string {
	return cs.fcn
}

func (cs *ComputedSeries) OutputSeriesName() string {
	if cs.fcn == "" {
		return cs.InputSeriesName
	}
	return fmt.Sprintf("%s_%s_%s", cs.InputSeriesName, cs.fcn, cs.duration.String())
}

func (cs *ComputedSeries) compute() (float64, bool) {
	switch cs.fcn {
	case "avg":
		return cs.computeAvg()
	default:
		panic("unknown function") // TODO
	}
}

func (cs *ComputedSeries) removeOld(now time.Time) {
	dt := -cs.duration
	cutoff := now.Add(dt)

	for {
		e := cs.values.Front()
		v := e.Value.(schema.Value)
		if v.Timestamp.Before(cutoff) {
			cs.values.Remove(e)
		} else {
			break
		}
	}
}

func (cs *ComputedSeries) computeAvg() (float64, bool) {
	sum := 0.0
	count := 0
	for e := cs.values.Front(); e != nil; e = e.Next() {
		v := e.Value.(schema.Value)
		if v.Value == 0 { // ignore zeros in the calculation
			continue
		}
		sum += v.Value
		count++
	}

	if count > 0 {
		return sum / float64(count), true
	}

	return 0, false
}

func (cs *ComputedSeries) LoadInitial(
	db storage.StorageBackend,
	start time.Time,
	now time.Time,
) (schema.Series, error) {
	// TODO: LoadInitial could use some tests
	lookBack := -cs.duration
	historyCutoff := now.Add(lookBack)
	window, err := db.LoadDataWindow(
		cs.InputSeriesName,
		start.Add(lookBack),
	)
	if err != nil {
		return schema.Series{}, errors.Wrap(err, "load original window")
	}

	fmt.Printf("loaded %d rows for %s (%s)\n", len(window.Values), cs.OutputSeriesName(), cs.InputSeriesName)

	count := 0
	sum := 0.0
	values := window.Values
	result := make([]schema.Value, 0, len(values))

	// TODO: avg function is hardcoded in code below

	for end, bgn := 0, 0; end < len(values); end++ {
		endPt := values[end]
		count++
		sum += endPt.Value
		cutoff := endPt.Timestamp.Add(lookBack)
		for ; bgn < end; bgn++ {
			bgnPt := values[bgn]
			if bgnPt.Timestamp.After(cutoff) {
				break
			}
			count--
			sum -= bgnPt.Value
		}
		if endPt.Timestamp.After(historyCutoff) {
			// TODO: I don't like how we're mixing this in here
			cs.values.PushBack(endPt)
		}
		if endPt.Timestamp.Before(start) {
			continue
		}
		value := sum / float64(count)
		result = append(result, schema.Value{
			Timestamp: endPt.Timestamp,
			Value:     value,
		})
	}

	return schema.Series{
		SeriesName: cs.OutputSeriesName(),
		Values:     result,
	}, nil
}

func (cs *ComputedSeries) ProcessNewValue(v schema.Value) (float64, bool) {
	cs.values.PushBack(v)
	cs.removeOld(v.Timestamp)
	return cs.compute()
}
