package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
)

type chain struct {
	ops []Operator
}

func (c chain) ProcessNewValues(values []schema.Value) []schema.Value {
	for _, op := range c.ops {
		values = op.ProcessNewValues(values)
	}
	return values
}
