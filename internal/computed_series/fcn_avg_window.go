package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
)

type FcnAvgWindow struct {
}

func (f *FcnAvgWindow) AddValue(v schema.Value) {
}

func (f *FcnAvgWindow) RemoveValue(v schema.Value) {
}

func (f *FcnAvgWindow) Compute(values *deque.Deque[schema.Value]) (float64, bool) {
	count := 0
	sum := 0.0

	for i := 0; i < values.Len(); i++ {
		sum += values.At(i).Value
		count++
	}

	if count == 0 {
		return 0, false
	}

	return sum / float64(count), true
}
