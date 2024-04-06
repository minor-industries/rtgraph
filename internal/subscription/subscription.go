package subscription

import (
	"fmt"
	"github.com/minor-industries/rtgraph/internal/computed_series"
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

type Subscription struct {
	positions   map[string]int
	lastSeen    map[string]time.Time
	maxGap      time.Duration
	allComputed []*computed_series.ComputedSeries
}

func NewSubscription(req *SubscriptionRequest) (*Subscription, error) {
	var reqs []computed_series.SeriesRequest
	for _, sn := range req.Series {
		req, err := computed_series.Parse(sn)
		if err != nil {
			return nil, errors.Wrap(err, "parse series")
		}
		reqs = append(reqs, req)
	}

	sub := &Subscription{
		lastSeen:  map[string]time.Time{},
		maxGap:    time.Millisecond * time.Duration(req.MaxGapMs),
		positions: map[string]int{},
	}

	for _, c := range reqs {
		cs := computed_series.NewComputedSeries(
			c.SeriesName,
			c.Function,
			c.Duration,
		)
		sub.allComputed = append(sub.allComputed, cs)
	}

	for idx, cs := range sub.allComputed {
		sub.positions[cs.OutputSeriesName()] = idx + 1
	}

	return sub, nil
}

func (sub *Subscription) GetInitialData(
	db storage.StorageBackend,
	windowStart time.Time,
	now time.Time,
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

	computedMap := map[string]*computed_series.ComputedSeries{} // keyed by output series name
	for _, cs := range sub.allComputed {
		computedMap[cs.OutputSeriesName()] = cs
	}

	allSeries := make([]schema.Series, len(sub.allComputed))
	for idx, cs := range sub.allComputed {
		var err error
		// TODO: we should have better dispatch here, e.g., through an interface
		if cs.FunctionName() == "" {
			allSeries[idx], err = cs.LoadInitial(db, start, now)
		} else {
			allSeries[idx], err = db.LoadDataWindow(cs.InputSeriesName, start)
		}
		if err != nil {
			return nil, errors.Wrap(err, "load data window")
		}
	}

	rows := &messages.Data{Rows: []any{}}
	if err := interleave(allSeries, func(seriesName string, value schema.Value) error {
		// TODO: can we rewrite PackRow so that it can't error?
		return sub.PackRow(rows, seriesName, value.Timestamp, value.Value)
	}); err != nil {
		return nil, errors.Wrap(err, "interleave")
	}

	return rows, nil
}

func (sub *Subscription) PackRow(
	data *messages.Data,
	seriesName string,
	timestamp time.Time,
	value float64,
) error {
	row := make([]any, len(sub.allComputed)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.allComputed); i++ {
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

func (sub *Subscription) InputMap() map[string][]*computed_series.ComputedSeries {
	result := map[string][]*computed_series.ComputedSeries{}
	for _, cs := range sub.allComputed {
		inName := cs.InputSeriesName
		result[inName] = append(result[inName], cs)
	}
	return result
}
