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

		series := op.ProcessNewValues(window.Values, now)
		allSeries[idx] = series
	}

	//columns := interleave(allSeries)
	//rows := consolidate_(columns)

	result := &messages.Data{
		Series: make([]messages.Series, len(allSeries)),
	}

	for idx, row := range allSeries {
		result.Series[idx] = messages.Series{
			Pos:     idx,
			Samples: make([]messages.Sample, len(row)),
		}
		for i, s := range row {
			result.Series[idx].Samples[i] = messages.Sample{
				Timestamp: s.Timestamp.UnixMilli(),
				Value:     s.Value,
			}
		}
	}

	return result, nil
}

func (sub *Subscription) addGaps_(idx int, series []schema.Value) []schema.Value {
	result := make([]schema.Value, 0, len(series))
	for _, c := range series {
		now := c.Timestamp
		seen, ok := sub.lastSeen[idx]
		sub.lastSeen[idx] = now

		if ok {
			// add a regular gap
			dt := now.Sub(seen)
			// insert a gap if timestamp delta exceeds threshold
			if dt > sub.maxGap {
				result = append(result, schema.Value{
					Timestamp: seen.Add(time.Millisecond),
					Value:     math.NaN(),
				})
			}
		} else {
			// add a gap just before the first point
			result = append(result, schema.Value{
				Timestamp: now.Add(-time.Millisecond), // TODO? reconsider
				Value:     math.NaN(),
			})
		}
		result = append(result, c)
	}

	return result
}

//func (sub *Subscription) packRow_(
//	data *messages.Data,
//	r row,
//) {
//	// assumes that all columns in the row are at the same timestamp
//	now := r[0].Timestamp
//
//	resultRow := make([]any, len(sub.operators)+1)
//	resultRow[0] = now.UnixMilli()
//
//	// first fill with nils
//	for i := 0; i < len(sub.operators); i++ {
//		resultRow[i+1] = nil
//	}
//
//	// overwrite any columns that exist
//	for _, c := range r {
//		resultRow[c.Index] = floatP(float32(c.Value))
//	}
//
//	data.Rows = append(data.Rows, resultRow)
//}

func (sub *Subscription) inputMap() map[string][]int {
	// output is map from input series names to indices into the sub.operators array
	result := map[string][]int{}
	for idx, inName := range sub.inputSeries {
		result[inName] = append(result[inName], idx)
	}
	return result
}

//func (sub *Subscription) packRows(values []schema.Value, pos int) (*messages.Data, error) {
//	data := &messages.Data{Rows: []interface{}{}}
//
//	gapped := sub.addGaps(pos, values)
//
//	var cols []col
//	for _, v := range gapped {
//		cols = append(cols, col{
//			Index:     pos,
//			Timestamp: v.Timestamp,
//			Value:     v.Value,
//		})
//	}
//
//	rows := consolidate(cols) // this may be unnecessary
//
//	for _, row := range rows {
//		sub.packRow(data, row)
//	}
//
//	return data, nil
//}

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
				output := op.ProcessNewValues(msg.Values, now)

				samples := make([]messages.Sample, len(output))

				for i, value := range output {
					samples[i] = messages.Sample{
						Timestamp: value.Timestamp.UnixMilli(),
						Value:     value.Value,
					}
				}

				data.Series = append(data.Series, messages.Series{
					Pos:     idx,
					Samples: samples,
				})
			}
		}

		outMsg <- data
	}
}
