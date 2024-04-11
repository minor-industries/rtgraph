package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
)

type OpGt struct {
	X float64
}

func (o OpGt) ProcessNewValues(values []schema.Value) []schema.Value {
	result := make([]schema.Value, 0, len(values))
	for _, value := range values {
		if value.Value > o.X {
			result = append(result, value)
		}
	}
	return result
}
