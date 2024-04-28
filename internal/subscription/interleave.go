package subscription

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

func floatP(v float32) *float32 {
	return &v
}

type col struct {
	Index int
	Value schema.Value
}

type row []col

func interleave(
	allSeries [][]schema.Value,
) []col {
	var result []col

	// TODO: interleave could use some tests!
	indices := make([]int, len(allSeries))

	remaining := 0
	for _, values := range allSeries {
		remaining += len(values)
	}

	for ; remaining > 0; remaining-- {
		found := 0
		var minT time.Time
		var minIdx int

		// this will be inefficient for a large number of series
		for i, values := range allSeries {
			j := indices[i]
			if j == len(values) {
				continue
			}
			v := values[j]
			if found == 0 || v.Timestamp.Before(minT) {
				minT = v.Timestamp
				minIdx = i
			}
			found++
		}

		minSeries := allSeries[minIdx]
		j := indices[minIdx]

		result = append(result, col{Index: minIdx, Value: minSeries[j]})
		indices[minIdx]++
	}

	return result
}

// combine columns at the same timestamp
func consolidate(cols []col) []row {
	var currentTime time.Time

	var result []row

	for _, col := range cols {
		if col.Value.Timestamp != currentTime {
			result = append(result, row{})
		}
		currentTime = col.Value.Timestamp
		result[len(result)-1] = append(result[len(result)-1], col)
	}

	return result
}
