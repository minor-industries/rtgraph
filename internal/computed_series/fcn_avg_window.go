package computed_series

import (
	"github.com/gammazero/deque"
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

type FcnAvgWindow struct {
	duration time.Duration
	scale    float64
}

func (f *FcnAvgWindow) AddValue(v schema.Value) {
}

func (f *FcnAvgWindow) RemoveValue(v schema.Value) {
}

func (f *FcnAvgWindow) Compute(values *deque.Deque[schema.Value], _ time.Time) (float64, bool) {
	count := 0.0
	sum := 0.0

	if values.Len() == 0 {
		return 0, false
	}

	// TODO: reconsider: should we use now from the values we have, or the "current" now?
	now := values.Back().Timestamp
	tStart := now.Add(-f.duration)

	for i := 0; i < values.Len(); i++ {
		v := values.At(i)

		dt := v.Timestamp.Sub(tStart)
		w := float64(dt) * f.scale

		//fmt.Println(i, dt, w)

		sum += v.Value * w
		count += w
	}

	//fmt.Println("")

	if count == 0 {
		return 0, false
	}

	return sum / count, true
}
