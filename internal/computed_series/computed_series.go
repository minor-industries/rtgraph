package computed_series

import (
	"container/list"
	"fmt"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
	"time"
)

type ComputedReq struct {
	SeriesName string
	Function   string
	Seconds    uint
}

func (req *ComputedReq) OutputSeriesName() string {
	return fmt.Sprintf("%s_%s_%ds", req.SeriesName, req.Function, req.Seconds)
}

func (req *ComputedReq) InputSeriesName() string {
	return req.SeriesName
}

type ComputedSeries struct {
	values           *list.List
	InputSeriesName  string // TODO: make private?
	OutputSeriesName string // TODO: make private?
	seconds          uint
	fcn              string
}

func OutputSeriesName(inputSeriesName string, fcn string, seconds uint) string {
	return fmt.Sprintf("%s_%s_%ds", inputSeriesName, fcn, seconds)
}

func NewComputedSeries(inputSeriesName string, fcn string, seconds uint) *ComputedSeries {
	cs := &ComputedSeries{
		values:           list.New(),
		InputSeriesName:  inputSeriesName,
		OutputSeriesName: OutputSeriesName(inputSeriesName, fcn, seconds),
		seconds:          seconds,
		fcn:              fcn,
	}

	return cs
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
	dt := -time.Duration(cs.seconds) * time.Second
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

func (cs *ComputedSeries) LoadInitial(db storage.StorageBackend, start time.Time) (schema.Series, error) {
	// TODO: LoadInitial could use some tests
	lookBack := -time.Duration(cs.seconds) * time.Second
	window, err := db.LoadDataWindow(
		cs.InputSeriesName,
		start.Add(lookBack),
	)
	if err != nil {
		return schema.Series{}, errors.Wrap(err, "load original window")
	}

	fmt.Printf("loaded %d rows for %s (%s)\n", len(window.Values), cs.OutputSeriesName, cs.InputSeriesName)

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
		if endPt.Timestamp.Before(start) {
			continue
		}
		if count == 0 {
			panic("didn't expect this")
		}
		value := sum / float64(count)
		result = append(result, schema.Value{
			Timestamp: endPt.Timestamp,
			Value:     value,
		})
	}

	// TODO: seed linked list for future values

	return schema.Series{
		SeriesName: cs.OutputSeriesName,
		Values:     result,
	}, nil
}

func (cs *ComputedSeries) ProcessNewValue(v schema.Value) (float64, bool) {
	cs.values.PushBack(v)
	cs.removeOld(v.Timestamp)
	return cs.compute()
}
