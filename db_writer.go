package rtgraph

import (
	"crypto/sha256"
	"github.com/minor-industries/rtgraph/database"
	"github.com/minor-industries/rtgraph/schema"
)

// TODO: we're leaking a database abstraction here
func hashedID(s string) []byte {
	var result [16]byte
	h := sha256.New()
	h.Write([]byte(s))
	sum := h.Sum(nil)
	copy(result[:], sum[:16])
	return result[:]
}

func (g *Graph) publishToDB() {
	msgCh := g.broker.Subscribe()
	defer g.broker.Unsubscribe(msgCh)

	for msg := range msgCh {
		switch m := msg.(type) {
		case schema.Series:
			// TODO: figure out how to pass a slice to Insert()
			for _, value := range m.Values {
				g.dbWriter.Insert(&database.Value{
					ID:        database.RandomID(),
					Timestamp: value.Timestamp,
					Value:     value.Value,
					SeriesID:  hashedID(m.SeriesName), // TODO: this seems bad. Perhaps provide a constructor that does this for us and don't allow using the struct form
				})
			}
		}
	}
}
