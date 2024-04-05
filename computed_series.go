package rtgraph

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

type computedSeries struct {
	values           *list.List
	inputSeriesName  string
	outputSeriesName string
	seconds          uint
	fcn              string
}

func OutputSeriesName(inputSeriesName string, fcn string, seconds uint) string {
	return fmt.Sprintf("%s_%s_%ds", inputSeriesName, fcn, seconds)
}

func newComputedSeries(inputSeriesName string, fcn string, seconds uint) *computedSeries {
	cs := &computedSeries{
		values:           list.New(),
		inputSeriesName:  inputSeriesName,
		outputSeriesName: OutputSeriesName(inputSeriesName, fcn, seconds),
		seconds:          seconds,
		fcn:              fcn,
	}

	return cs
}

func (cs *computedSeries) compute() (float64, bool) {
	switch cs.fcn {
	case "avg":
		return cs.computeAvg()
	default:
		panic("unknown function") // TODO
	}
}

func (g *Graph) computeDerivedSeries(
	backend storage.StorageBackend,
	ch chan error,
	reqs []ComputedReq,
) {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	computedMap := map[string][]*computedSeries{}

	now := time.Now()
	for _, req := range reqs {
		cs := newComputedSeries(req.SeriesName, req.Function, req.Seconds)
		err := cs.loadInitial(backend, now)
		if err != nil {
			ch <- errors.Wrap(err, "")
			return
		}
		computedMap[cs.inputSeriesName] = append(computedMap[cs.inputSeriesName], cs)
	}

	for msg := range msgCh {
		m, ok := msg.(*schema.Series)
		if !ok {
			continue
		}

		allCs, ok := computedMap[m.SeriesName]
		if !ok {
			continue
		}

		for _, cs := range allCs {
			outValues := make([]schema.Value, len(m.Values))

			for idx, v := range m.Values {
				cs.values.PushBack(m)
				cs.removeOld(v.Timestamp)
				value, ok := cs.compute()
				if !ok {
					continue
				}

				outValues[idx] = schema.Value{
					Timestamp: v.Timestamp,
					Value:     value,
				}
			}

			g.broker.Publish(&schema.Series{
				SeriesName: cs.outputSeriesName,
				Values:     outValues,
			})
		}
	}
}

func (cs *computedSeries) removeOld(now time.Time) {
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

func (cs *computedSeries) computeAvg() (float64, bool) {
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

func (cs *computedSeries) loadInitial(db storage.StorageBackend, now time.Time) error {
	return errors.New("not implemented")
	//lookBack := -time.Duration(cs.seconds) * time.Second
	//window, err := db.LoadDataWindow(
	//	[]string{cs.inputSeriesName},
	//	now.Add(lookBack),
	//)
	//if err != nil {
	//	return errors.Wrap(err, "load data window")
	//}
	//
	//fmt.Printf("loaded %d rows for %s (%s)\n", len(window), cs.outputSeriesName, cs.inputSeriesName)
	//
	//for _, value := range window {
	//	cs.values.PushBack(schema.Value{
	//		Timestamp: value.Timestamp,
	//		Value:     value.Value,
	//	})
	//}
	//
	//return nil
}
