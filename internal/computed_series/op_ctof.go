package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
)

type OpCtoF struct{}

func (o OpCtoF) ProcessNewValues(values []schema.Value) []schema.Value {
	result := make([]schema.Value, len(values))
	for idx, value := range values {
		result[idx] = schema.Value{
			Timestamp: value.Timestamp,
			Value:     value.Value*1.8 + 32,
		}
	}
	return result
}
