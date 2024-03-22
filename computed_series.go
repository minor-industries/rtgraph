package rtgraph

import (
	"container/list"
	"fmt"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

func (g *Graph) computeDerivedSeries(computed []Computed) {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	values := list.New()

	computedMap := map[string]Computed{}
	for _, c := range computed {
		computedMap[c.SeriesName] = c
	}

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			c, ok := computedMap[m.SeriesName]
			if !ok {
				continue
			}

			values.PushBack(m)
			dt := -time.Duration(c.Seconds) * time.Second
			removeOld(values, m.Timestamp.Add(dt))

			switch c.Function {
			case "avg":
				avg, ok := computeAvg(values)
				if ok {
					seriesName := c.Name()
					g.broker.Publish(&schema.Series{
						SeriesName: seriesName,
						Timestamp:  m.Timestamp,
						Value:      avg,
						SeriesID:   database.HashedID(seriesName),
					})
				}
			default:
				panic(fmt.Errorf("unknown function %s", c.Function))
			}
		}
	}
}

func removeOld(values *list.List, cutoff time.Time) {
	for {
		e := values.Front()
		v := e.Value.(*schema.Series)
		if v.Timestamp.Before(cutoff) {
			values.Remove(e)
		} else {
			break
		}
	}
}

func computeAvg(values *list.List) (float64, bool) {
	sum := 0.0
	count := 0
	for e := values.Front(); e != nil; e = e.Next() {
		v := e.Value.(*schema.Series)
		sum += v.Value
		count++
	}

	if count > 0 {
		return sum / float64(count), true
	}

	return 0, false
}
