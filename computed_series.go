package rtgraph

import (
	"container/list"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

func (g *Graph) computeDerivedSeries() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	values := list.New()

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			switch m.SeriesName {
			case "sample1":
				values.PushBack(m)
				removeOld(values, m.Timestamp.Add(-30*time.Second))
				avg, ok := computeAvg(values)
				if ok {
					seriesName := m.SeriesName + "_avg_30s"
					g.broker.Publish(&schema.Series{
						SeriesName: seriesName,
						Timestamp:  m.Timestamp,
						Value:      avg,
						SeriesID:   database.HashedID(seriesName),
					})
				}
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
