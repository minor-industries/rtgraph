package schema

import "time"

type Value struct {
	Timestamp time.Time
	Value     float64
}

type Series struct {
	SeriesName string
	Values     []Value
}

func (s Series) Name() string {
	return "series"
}
