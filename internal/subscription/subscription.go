package subscription

import (
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
		lastSeen: map[int]time.Time{},
		maxGap:   time.Millisecond * time.Duration(req.MaxGapMs),
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

	allSeries := make([][]schema.Value, len(sub.allComputed))
	for idx, cs := range sub.allComputed {
		var err error
		// TODO: we should have better dispatch here, e.g., through an interface
		// or perhaps this just all goes through the same code path with an identity transformer
		if cs.FunctionName() == "" {
			var series schema.Series
			series, err = db.LoadDataWindow(cs.InputSeriesName, start)
			if err != nil {
				return nil, errors.Wrap(err, "load data window")
			}
			allSeries[idx] = series.Values
		} else {
			allSeries[idx], err = cs.LoadInitial(db, start)
			if err != nil {
				return nil, errors.Wrap(err, "load initial")
			}
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

func (sub *Subscription) inputMap() map[string][]int {
	// output is map from input series names to indices into the sub.allComputed array
	result := map[string][]int{}
	for idx, cs := range sub.allComputed {
		inName := cs.InputSeriesName
		result[inName] = append(result[inName], idx)
	}
	return result
}

func (sub *Subscription) packRows(values []schema.Value, pos int) (*messages.Data, error) {
	data := &messages.Data{Rows: []interface{}{}}

	for _, v := range values {
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

	sub.produceAllSeries(broker, msgCh)
}

func (sub *Subscription) produceAllSeries(broker *broker.Broker, outMsg chan *messages.Data) {
	msgCh := broker.Subscribe()
	defer broker.Unsubscribe(msgCh)

	computedMap := sub.inputMap()

	for m := range msgCh {
		msg, ok := m.(schema.Series)
		if !ok {
			continue
		}

		if out, ok := computedMap[msg.SeriesName]; ok {
			for _, idx := range out {
				cs := sub.allComputed[idx]
				// TODO: need better dispatch here
				var output []schema.Value
				if cs.FunctionName() == "" {
					output = msg.Values
				} else {
					output = cs.ProcessNewValues(msg.Values)
				}

				data, err := sub.packRows(output, idx+1)
				if err != nil {
					outMsg <- &messages.Data{
						Error: errors.Wrap(err, "pack rows").Error(),
					}
					return
				}
				outMsg <- data
			}
		}
	}
}
