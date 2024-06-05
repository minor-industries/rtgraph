package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
)

type Chain struct {
	ops []Operator
}

func (c Chain) ProcessNewValues(values []schema.Value) []schema.Value {
	for _, op := range c.ops {
		values = op.ProcessNewValues(values)
	}
	return values
}
