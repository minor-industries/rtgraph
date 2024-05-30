package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type chain struct {
	ops []Operator
}

func (c chain) ProcessNewValues(values []schema.Value, now time.Time) []schema.Value {
	for _, op := range c.ops {
		values = op.ProcessNewValues(values, now)
	}
	return values
}
