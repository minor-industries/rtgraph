package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
)

type FcnAvg struct {
	count int
	sum   float64
}

func (f *FcnAvg) AddValue(v schema.Value) {
	f.count++
	f.sum += v.Value
}

func (f *FcnAvg) RemoveValue(v schema.Value) {
	f.count--
	f.sum -= v.Value
}

func (f *FcnAvg) Compute(_ *deque.Deque[schema.Value]) (float64, bool) {
	if f.count <= 0 {
		return 0, false
	}

	return f.sum / float64(f.count), true
}
