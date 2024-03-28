package rtgraph

import (
	"container/list"
	"fmt"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
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

func (g *Graph) computeDerivedSeries(reqs []ComputedReq) {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	computedMap := map[string][]*computedSeries{}

	for _, req := range reqs {
		cs := newComputedSeries(req.SeriesName, req.Function, req.Seconds)
		computedMap[cs.inputSeriesName] = append(computedMap[cs.inputSeriesName], cs)
	}

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			allCs, ok := computedMap[m.SeriesName]
			if !ok {
				continue
			}

			for _, cs := range allCs {
				cs.values.PushBack(m)
				cs.removeOld(m.Timestamp)
				value, ok := cs.compute()
				if ok {
					g.broker.Publish(&schema.Series{
						SeriesName: cs.outputSeriesName,
						Timestamp:  m.Timestamp,
						Value:      value,
						SeriesID:   database.HashedID(cs.outputSeriesName),
					})
				}
			}
		}
	}
}

func (cs *computedSeries) removeOld(now time.Time) {
	dt := -time.Duration(cs.seconds) * time.Second
	cutoff := now.Add(dt)

	for {
		e := cs.values.Front()
		v := e.Value.(*schema.Series)
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
		v := e.Value.(*schema.Series)
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
