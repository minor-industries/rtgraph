package computed_series

import "github.com/minor-industries/rtgraph/schema"

type Operator interface {
	ProcessNewValues(values []schema.Value) []schema.Value
}

type Identity struct{}

func (i Identity) ProcessNewValues(values []schema.Value) []schema.Value {
	return values
}
