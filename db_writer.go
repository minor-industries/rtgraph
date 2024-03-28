package rtgraph

import (
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

func (g *Graph) dbWriter() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	ticker := time.NewTicker(100 * time.Millisecond)

	var rows []any

	for {
		select {
		case msg := <-msgCh:
			switch m := msg.(type) {
			case *schema.Series:
				rows = append(rows, database.Value{
					ID:        database.RandomID(),
					Timestamp: m.Timestamp,
					Value:     m.Value,
					SeriesID:  m.SeriesID,
				})
			}
		case <-ticker.C:
			if len(rows) == 0 {
				continue
			}

			err := g.db.Transaction(func(tx *gorm.DB) error {
				for _, row := range rows {
					res := tx.Create(row)
					if res.Error != nil {
						return errors.Wrap(res.Error, "create")
					}
				}
				return nil
			})

			rows = nil

			if err != nil {
				g.errCh <- errors.Wrap(err, "transaction")
				return
			}
		}
	}
}
