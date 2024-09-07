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
	inputSeries []string
	operators   []computed_series.Operator
	req         *Request
}

func NewSubscription(
	parser *computed_series.Parser,
	req *Request,
	start time.Time,
) (*Subscription, error) {
	sub := &Subscription{
		req:         req,
		lastSeen:    map[int]time.Time{},
		operators:   make([]computed_series.Operator, len(req.Series)),
		inputSeries: make([]string, len(req.Series)),
	}

	for idx, sn := range req.Series {
		inputSeriesName, op, err := parser.Parse(sn, start)
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
) (*messages.Data, error) {
	allSeries := make([][]schema.Value, len(sub.operators))
	for idx, op := range sub.operators {
		var window schema.Series
		var err error
		if sub.req.Date != "" {
			// TODO: should this handle more cases than just local time?
			t0, err := time.ParseInLocation("2006-01-02", sub.req.Date, time.Local)
			if err != nil {
				return nil, errors.Wrap(err, "parse date")
			}
			t1 := t0.AddDate(0, 0, 1)
			window, err = db.LoadDataBetween(sub.inputSeries[idx], t0, t1)
		} else {
			var lookback time.Duration = 0
			if wo, ok := op.(computed_series.WindowedOperator); ok {
				lookback = wo.Lookback()
			}

			window, err = db.LoadDataAfter(
				sub.inputSeries[idx],
				start.Add(-lookback),
			)
		}
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
	start time.Time,
) {
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

func (sub *Subscription) produceAllSeries(
	broker *broker.Broker,
	outMsg chan *messages.Data,
) {
	var cutoffTime int64
	if sub.req.Date != "" {
		// if date given, we want to stop streaming points that are after this date
		t, err := time.ParseInLocation("2006-01-02", sub.req.Date, time.Local)
		if err != nil {
			outMsg <- &messages.Data{
				Error: errors.Wrap(err, "parse date").Error(),
			}
			close(outMsg)
			return
		}
		t = t.AddDate(0, 0, 1)
		cutoffTime = t.UnixMilli()
	}

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

				timestamps := make([]int64, 0, len(series))
				values := make([]float64, 0, len(series))

				for _, s := range series {
					ts := s.Timestamp.UnixMilli()
					if cutoffTime > 0 && ts >= cutoffTime {
						continue
					}

					timestamps = append(timestamps, ts)
					values = append(values, s.Value)
				}

				if len(timestamps) == 0 {
					continue
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
