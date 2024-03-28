package rtgraph

import (
	"encoding/hex"
	"fmt"
	"github.com/minor-industries/rtgraph/messages"
	"math"
	"time"
)

type SubscriptionRequest struct {
	Series      []string `json:"series"`
	WindowSize  uint64   `json:"windowSize"`
	LastPointMs uint64   `json:"lastPointMs"`
	MaxGapMs    uint64   `json:"maxGapMs"`
}

type subscription struct {
	series    []string
	ids       [][]byte
	positions map[string]int
	lastSeen  map[string]time.Time
	maxGap    time.Duration
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

	addGap := func() {
		gap := make([]any, len(row))
		copy(gap, row)
		gap[pos] = math.NaN()
		data.Rows = append(data.Rows, gap)
	}

	if ok {
		dt := timestamp.Sub(seen)
		// insert a gap if timestamp delta exceeds threshold
		if dt > sub.maxGap {
			addGap()
		}
	} else {
		addGap()
	}

	data.Rows = append(data.Rows, row)
	return nil
}
