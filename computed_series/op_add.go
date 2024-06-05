package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
)

type OpAdd struct {
	X float64
}

func (o OpAdd) ProcessNewValues(values []schema.Value) []schema.Value {
	result := make([]schema.Value, len(values))
	for idx, value := range values {
		result[idx] = schema.Value{
			Timestamp: value.Timestamp,
			Value:     value.Value + o.X,
		}
	}
	return result
}
