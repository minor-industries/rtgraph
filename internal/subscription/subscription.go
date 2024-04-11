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

type Subscription struct {
	// TODO: combine inputSeries, operators, lastSeen into struct
	lastSeen    map[int]time.Time // for each position
	maxGap      time.Duration
	inputSeries []string
	operators   []computed_series.Operator
}

func NewSubscription(
	req *Request,
	start time.Time,
) (*Subscription, error) {
	var reqs []computed_series.SeriesRequest
	for _, sn := range req.Series {
		req, err := computed_series.Parse(sn)
		if err != nil {
			return nil, errors.Wrap(err, "parse series")
		}
		reqs = append(reqs, req)
	}

	sub := &Subscription{
		lastSeen:    map[int]time.Time{},
		maxGap:      time.Millisecond * time.Duration(req.MaxGapMs),
		operators:   make([]computed_series.Operator, len(req.Series)),
		inputSeries: make([]string, len(req.Series)),
	}

	for idx, r := range reqs {
		sub.inputSeries[idx] = r.SeriesName
		if r.Function == "" { // TODO: this is a hack
			sub.operators[idx] = computed_series.Identity{}
		} else {
			fcn, err := computed_series.GetFcn(r.Function)
			if err != nil {
				return nil, errors.Wrap(err, "get fcn")
			}
			sub.operators[idx] = computed_series.NewComputedSeries(
				fcn,
				r.Duration,
				start,
			)
		}
	}

	return sub, nil
}

func (sub *Subscription) getInitialData(
	db storage.StorageBackend,
	start time.Time,
) (*messages.Data, error) {

	allSeries := make([][]schema.Value, len(sub.operators))
	for idx, op := range sub.operators {
		var lookback time.Duration = 0
		if wo, ok := op.(computed_series.WindowedOperator); ok {
			lookback = wo.Lookback()
		}

		window, err := db.LoadDataWindow(
			sub.inputSeries[idx],
			start.Add(-lookback),
		)
		if err != nil {
			return nil, errors.Wrap(err, "load original window")
		}

		allSeries[idx] = op.ProcessNewValues(window.Values)
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
	row := make([]any, len(sub.operators)+1)
	row[0] = timestamp.UnixMilli()

	// first fill with nils
	for i := 0; i < len(sub.operators); i++ {
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
	// output is map from input series names to indices into the sub.operators array
	result := map[string][]int{}
	for idx, inName := range sub.inputSeries {
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
	msgCh chan *messages.Data,
	now time.Time,
	start time.Time,
) {
	msgCh <- &messages.Data{
		Now: uint64(now.UnixMilli()),
	}

	initialData, err := sub.getInitialData(db, start)
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
				op := sub.operators[idx]
				// TODO: need better dispatch here
				output := op.ProcessNewValues(msg.Values)

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
