package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type FcnGate struct {
	target float64
	open   bool
}

func (f *FcnGate) AddValue(v schema.Value) {}

func (f *FcnGate) RemoveValue(v schema.Value) {}

func (f *FcnGate) Compute(values *deque.Deque[schema.Value], now time.Time) (float64, bool) {
	sz := values.Len()
	if sz == 0 {
		return 0, false
	}

	lastIdx := sz - 1
	lastValue := values.At(lastIdx).Value

	if lastValue > f.target {
		f.open = true
	}

	// TODO: close when appropriate

	if f.open {
		return lastValue, true
	} else {
		return 0, false
	}
}
