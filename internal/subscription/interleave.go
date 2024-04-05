package subscription

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

func floatP(v float32) *float32 {
	return &v
}

func interleave(
	allSeries []schema.Series,
	f func(seriesName string, value schema.Value) error,
) error {
	// TODO: interleave could use some tests!
	indices := make([]int, len(allSeries))

	remaining := 0
	for _, s := range allSeries {
		remaining += len(s.Values)
	}

	for ; remaining > 0; remaining-- {
		found := 0
		var minT time.Time
		var minIdx int

		// this will be inefficient for a large number of series
		for i, s := range allSeries {
			j := indices[i]
			if j == len(s.Values) {
				continue
			}
			v := s.Values[j]
			if found == 0 || v.Timestamp.Before(minT) {
				minT = v.Timestamp
				minIdx = i
			}
			found++
		}

		minSeries := allSeries[minIdx]
		j := indices[minIdx]
		if err := f(minSeries.SeriesName, minSeries.Values[j]); err != nil {
			return err
		}
		indices[minIdx]++
	}

	return nil
}
