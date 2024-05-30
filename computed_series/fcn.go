package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type Fcn interface {
	// AddValue and RemoveValue may be used when aggregations may be used instead of individual points, e.g. avg
	AddValue(v schema.Value)
	RemoveValue(v schema.Value)

	// Compute may be used instead of AddValue and RemoveValue when individual points in the window are needed
	Compute(values *deque.Deque[schema.Value], now time.Time) (float64, bool)
}
