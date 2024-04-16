package computed_series

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type Operator interface {
	ProcessNewValues(values []schema.Value, now time.Time) []schema.Value
}

type WindowedOperator interface {
	Lookback() time.Duration
}

type Identity struct{}

func (i Identity) ProcessNewValues(values []schema.Value, now time.Time) []schema.Value {
	return values
}
