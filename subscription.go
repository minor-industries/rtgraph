package rtgraph

import (
	"encoding/hex"
	"fmt"
	"github.com/minor-industries/rtgraph/messages"
	"math"
	"time"
)

type subscription struct {
	series    []string
	ids       [][]byte
	positions map[string]int
	lastSeen  map[string]time.Time
}

func (sub *subscription) packRow(
	data *messages.Data,
	seriesID []byte,
	timestamp time.Time,
	value float64,
) error {
	row := make([]any, len(sub.series)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.series); i++ {
		row[i+1] = nil
	}

	pos, ok := sub.positions[string(seriesID)]
	if !ok {
		return fmt.Errorf("found value %s with unknown series", hex.EncodeToString(seriesID))
	}
	row[pos] = floatP(float32(value))

	seen, ok := sub.lastSeen[string(seriesID)]
	sub.lastSeen[string(seriesID)] = timestamp
	if ok {
		dt := timestamp.Sub(seen)
		// insert a gap if timestamp delta exceeds threshold
		if dt > 1200*time.Millisecond { // TODO: configure based on graph, etc
			gap := make([]any, len(row))
			copy(gap, row)
			gap[pos] = math.NaN()
			data.Rows = append(data.Rows, gap)
		}
	}

	data.Rows = append(data.Rows, row)
	return nil
}
