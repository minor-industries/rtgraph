package subscription

import (
	"fmt"
	"github.com/minor-industries/rtgraph/broker"
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
	lastSeen    map[int]time.Time // for each position
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
		lastSeen:  map[int]time.Time{},
		maxGap:    time.Millisecond * time.Duration(req.MaxGapMs),
		positions: map[string]int{},
	}

	for _, r := range reqs {
		var fcn computed_series.Fcn
		var err error

		if r.Function != "" {
			fcn, err = computed_series.GetFcn(r.Function)
			if err != nil {
				return nil, errors.Wrap(err, "get fcn")
			}
		}

		cs := computed_series.NewComputedSeries(
			r.SeriesName,
			fcn,
			r.Duration,
		)
		sub.allComputed = append(sub.allComputed, cs)
	}

	for idx, cs := range sub.allComputed {
		sub.positions[cs.OutputSeriesName()] = idx + 1
	}

	return sub, nil
}

func (sub *Subscription) getInitialData(
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

	allSeries := make([]schema.Series, len(sub.allComputed))
	for idx, cs := range sub.allComputed {
		var err error
		// TODO: we should have better dispatch here, e.g., through an interface
		if cs.FunctionName() == "" {
			allSeries[idx], err = db.LoadDataWindow(cs.InputSeriesName, start)
		} else {
			allSeries[idx], err = cs.LoadInitial(db, start)
		}
		if err != nil {
			return nil, errors.Wrap(err, "load data window")
		}
	}

	rows := &messages.Data{Rows: []any{}}
	if err := interleave(allSeries, func(idx int, value schema.Value) error {
		// TODO: can we rewrite packRow so that it can't error?
		return sub.packRow(rows, idx+1, value.Timestamp, value.Value)
	}); err != nil {
		return nil, errors.Wrap(err, "interleave")
	}

	return rows, nil
}

func (sub *Subscription) packRow(
	data *messages.Data,
	pos int,
	timestamp time.Time,
	value float64,
) error {
	row := make([]any, len(sub.allComputed)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.allComputed); i++ {
		row[i+1] = nil
	}

	row[pos] = floatP(float32(value))

	addGap := func() {
		gap := make([]any, len(row))
		copy(gap, row)
		gap[pos] = math.NaN()
		data.Rows = append(data.Rows, gap)
	}

	seen, ok := sub.lastSeen[pos]
	sub.lastSeen[pos] = timestamp

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

func (sub *Subscription) inputMap() map[string][]*computed_series.ComputedSeries {
	result := map[string][]*computed_series.ComputedSeries{}
	for _, cs := range sub.allComputed {
		inName := cs.InputSeriesName
		result[inName] = append(result[inName], cs)
	}
	return result
}

func (sub *Subscription) packRows(s schema.Series) (*messages.Data, error) {
	pos, ok := sub.positions[s.SeriesName]
	if !ok {
		return nil, fmt.Errorf("found value with unknown series: %s", s.SeriesName)
	}

	data := &messages.Data{Rows: []interface{}{}}

	for _, v := range s.Values {
		// TODO: don't love how data is passed in here, can we return the row (or do something else)?
		err := sub.packRow(data, pos, v.Timestamp, v.Value)
		if err != nil {
			return nil, errors.Wrap(err, "pack row")
		}
	}

	return data, nil
}

func (sub *Subscription) Run(
	db storage.StorageBackend,
	broker *broker.Broker,
	now time.Time,
	msgCh chan *messages.Data,
	req *SubscriptionRequest,
) {
	msgCh <- &messages.Data{
		Now: uint64(now.UnixMilli()),
	}

	windowSize := time.Duration(req.WindowSize) * time.Millisecond
	start := now.Add(-windowSize)

	initialData, err := sub.getInitialData(db, start, req.LastPointMs)
	if err != nil {
		msgCh <- &messages.Data{
			Error: errors.Wrap(err, "get initial data").Error(),
		}
		return
	}

	msgCh <- initialData
	seriesCh := make(chan schema.Series)
	// TODO: need to close all these channels, etc

	go func() {
		msgCh := broker.Subscribe()
		defer broker.Unsubscribe(msgCh)

		computedMap := sub.inputMap()

		for m := range msgCh {
			msg, ok := m.(schema.Series)
			if !ok {
				continue
			}

			if css, ok := computedMap[msg.SeriesName]; ok {
				for _, cs := range css {
					// TODO: need better dispatch here
					if cs.FunctionName() == "" {
						seriesCh <- msg
					} else {
						computeAndPublishOutputSeries(cs, msg, seriesCh)
					}
				}
			}
		}
	}()

	for series := range seriesCh {
		data, err := sub.packRows(series)
		if err != nil {
			msgCh <- &messages.Data{
				Error: errors.Wrap(err, "pack rows").Error(),
			}
			return
		}
		msgCh <- data
	}
}

func computeAndPublishOutputSeries(
	cs *computed_series.ComputedSeries,
	msg schema.Series,
	seriesCh chan schema.Series,
) {

	for _, v := range msg.Values {
		value, ok := cs.ProcessNewValue(v)
		if !ok {
			continue
		}
		seriesCh <- schema.Series{
			SeriesName: cs.OutputSeriesName(),
			Values: []schema.Value{{
				Timestamp: v.Timestamp,
				Value:     value,
			}},
			Persisted: false,
		}
	}
}
