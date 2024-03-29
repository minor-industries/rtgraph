package rtgraph

import (
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
)

func (g *Graph) publishToDB() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	for msg := range msgCh {
		switch m := msg.(type) {
		case *schema.Series:
			g.dbWriter.Insert(&database.Value{
				ID:        database.RandomID(),
				Timestamp: m.Timestamp,
				Value:     m.Value,
				SeriesID:  m.SeriesID,
			})
		}
	}
}
