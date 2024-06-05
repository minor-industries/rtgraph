package subscription

import (
	"github.com/minor-industries/rtgraph/broker"
	"github.com/minor-industries/rtgraph/computed_series"
	"github.com/minor-industries/rtgraph/messages"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
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
	sub := &Subscription{
		lastSeen:    map[int]time.Time{},
		maxGap:      time.Millisecond * time.Duration(req.MaxGapMs),
		operators:   make([]computed_series.Operator, len(req.Series)),
		inputSeries: make([]string, len(req.Series)),
	}

	for idx, sn := range req.Series {
		inputSeriesName, op, err := computed_series.Parse(sn, start)
		if err != nil {
			return nil, errors.Wrap(err, "parse series")
		}
		sub.inputSeries[idx] = inputSeriesName
		sub.operators[idx] = op
	}

	return sub, nil
}

func (sub *Subscription) getInitialData(
	db storage.StorageBackend,
	start time.Time,
	now time.Time,
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

		series := op.ProcessNewValues(window.Values)
		allSeries[idx] = series
	}

	result := &messages.Data{}

	for idx, series := range allSeries {
		if len(series) == 0 {
			continue
		}

		timestamps := make([]int64, len(series))
		values := make([]float64, len(series))

		for i, s := range series {
			timestamps[i] = s.Timestamp.UnixMilli()
			values[i] = s.Value
		}

		result.Series = append(result.Series, messages.Series{
			Pos:        idx,
			Timestamps: timestamps,
			Values:     values,
		})
	}

	return result, nil
}

func (sub *Subscription) inputMap() map[string][]int {
	// output is map from input series names to indices into the sub.operators array
	result := map[string][]int{}
	for idx, inName := range sub.inputSeries {
		result[inName] = append(result[inName], idx)
	}
	return result
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

	initialData, err := sub.getInitialData(db, start, now)
	if err != nil {
		msgCh <- &messages.Data{
			Error: errors.Wrap(err, "get initial data").Error(),
		}
		return
	}
	msgCh <- initialData

	sub.produceAllSeries(broker, msgCh, now)
}

func (sub *Subscription) produceAllSeries(
	broker *broker.Broker,
	outMsg chan *messages.Data,
	now time.Time,
) {
	msgCh := broker.Subscribe()
	defer broker.Unsubscribe(msgCh)

	computedMap := sub.inputMap()

	for m := range msgCh {
		msg, ok := m.(schema.Series)
		if !ok {
			continue
		}

		data := &messages.Data{}

		if out, ok := computedMap[msg.SeriesName]; ok {
			for _, idx := range out {
				op := sub.operators[idx]
				series := op.ProcessNewValues(msg.Values)
				if len(series) == 0 {
					continue
				}

				timestamps := make([]int64, len(series))
				values := make([]float64, len(series))

				for i, s := range series {
					timestamps[i] = s.Timestamp.UnixMilli()
					values[i] = s.Value
				}

				data.Series = append(data.Series, messages.Series{
					Pos:        idx,
					Timestamps: timestamps,
					Values:     values,
				})
			}
		}

		if len(data.Series) == 0 {
			continue
		}

		outMsg <- data
	}
}
