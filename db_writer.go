package rtgraph

import (
	"crypto/sha256"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
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
				err := g.db.InsertValue(m.SeriesName, value.Timestamp, value.Value)
				if err != nil {
					g.errCh <- errors.Wrap(err, "insert value to db")
					return
				}
			}
		}
	}
}
