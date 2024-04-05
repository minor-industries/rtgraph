package rtgraph

import (
	"fmt"
	"github.com/chrispappas/golang-generics-set/set"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
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
	seriesNames []string
	positions   map[string]int
	lastSeen    map[string]time.Time
	maxGap      time.Duration
	allSeries   set.Set[string]
	computedMap map[string][]*computedSeries
}

func newSubscription(
	computed map[string]ComputedReq,
	req *SubscriptionRequest,
) *subscription {
	positions := map[string]int{}

	for idx, seriesName := range req.Series {
		positions[seriesName] = idx + 1
	}

	sub := &subscription{
		seriesNames: req.Series,
		allSeries:   set.FromSlice(req.Series),
		positions:   positions,
		lastSeen:    map[string]time.Time{},
		maxGap:      time.Millisecond * time.Duration(req.MaxGapMs),
		computedMap: map[string][]*computedSeries{},
	}

	for _, c := range computed {
		if !sub.allSeries.Has(c.OutputSeriesName()) {
			continue
		}
		cs := newComputedSeries(
			c.SeriesName,
			c.Function,
			c.Seconds,
		)
		inName := c.InputSeriesName()
		sub.computedMap[inName] = append(sub.computedMap[inName], cs)
	}

	return sub
}

func (sub *subscription) loadInitial(db storage.StorageBackend, now time.Time) error {
	for _, css := range sub.computedMap {
		for _, cs := range css {
			err := cs.loadInitial(db, now)
			if err != nil {
				return errors.Wrap(err, "load initial")
			}
		}
	}
	return nil
}

func (sub *subscription) getInitialData(
	db storage.StorageBackend,
	windowStart time.Time,
	lastPointMs uint64,
) (*messages.Data, error) {
	start := windowStart // by default
	if lastPointMs != 0 {
		tStartAfter := time.UnixMilli(int64(lastPointMs + 1))
		if tStartAfter.After(windowStart) {
			// only use if inside the start window
			start = tStartAfter
		}
	}

	allSeries := make([]schema.Series, len(sub.seriesNames))
	for idx, name := range sub.seriesNames {
		var err error
		allSeries[idx], err = db.LoadDataWindow(name, start)
		if err != nil {
			return nil, errors.Wrap(err, "load data window")
		}
	}

	rows := &messages.Data{Rows: []any{}}
	if err := interleave(allSeries, func(seriesName string, value schema.Value) error {
		// TODO: can we rewrite packRow so that it can't error?
		return sub.packRow(rows, seriesName, value.Timestamp, value.Value)
	}); err != nil {
		return nil, errors.Wrap(err, "interleave")
	}

	return rows, nil
}

func (sub *subscription) packRow(
	data *messages.Data,
	seriesName string,
	timestamp time.Time,
	value float64,
) error {
	row := make([]any, len(sub.seriesNames)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.seriesNames); i++ {
		row[i+1] = nil
	}

	pos, ok := sub.positions[seriesName]
	if !ok {
		return fmt.Errorf("found value with unknown series: %s", seriesName)
	}
	row[pos] = floatP(float32(value))

	seen, ok := sub.lastSeen[seriesName]
	sub.lastSeen[seriesName] = timestamp

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
