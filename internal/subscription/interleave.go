package subscription

import (
	"github.com/minor-industries/rtgraph/schema"
	"time"
)

func floatP(v float32) *float32 {
	return &v
}

type col struct {
	Index     int
	Timestamp time.Time
	Value     float64
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

		result = append(result, col{
			Index:     minIdx + 1,
			Timestamp: minSeries[j].Timestamp,
			Value:     minSeries[j].Value,
		})
		indices[minIdx]++
	}

	return result
}

// combine columns at the same timestamp
func consolidate(cols []col) []row {
	var result []row

	var acc row

	for _, col := range cols {
		if len(acc) == 0 || col.Timestamp.UnixMilli() == acc[0].Timestamp.UnixMilli() {
			acc = append(acc, col)
		} else {
			result = append(result, acc)
			acc = row{col}
		}
	}

	// last group
	if len(acc) > 0 {
		result = append(result, acc)
	}

	return result
}
