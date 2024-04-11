package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
)

type Fcn interface {
	Name() string

	// AddValue and RemoveValue may be used when aggregations may be used instead of individual points, e.g. avg
	AddValue(v schema.Value)
	RemoveValue(v schema.Value)

	// Compute may be used instead of AddValue and RemoveValue when individual points in the window are needed
	Compute(values *deque.Deque[schema.Value]) (float64, bool)
}

type FcnAvg struct {
	count int
	sum   float64
}

func (f *FcnAvg) Name() string {
	return "avg"
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
