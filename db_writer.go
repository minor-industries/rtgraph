package rtgraph

import (
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"time"
)

func (g *Graph) dbWriter() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	ticker := time.NewTicker(100 * time.Millisecond)

	var values []database.Value

	for {
		select {
		case msg := <-msgCh:
			switch m := msg.(type) {
			case *schema.Series:
				values = append(values, database.Value{
					ID:        database.RandomID(),
					Timestamp: m.Timestamp,
					Value:     m.Value,
					SeriesID:  m.SeriesID,
				})
			}
		case <-ticker.C:
			if len(values) == 0 {
				continue
			}

			tx := g.db.Create(&values)
			if tx.Error != nil {
				g.errCh <- errors.Wrap(tx.Error, "create value")
				return
			}

			values = nil
		}
	}
}
