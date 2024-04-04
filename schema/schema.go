package schema

import "time"

// TODO: should this be "Value"?
type Series struct {
	SeriesName string
	Timestamp  time.Time
	Value      float64
}

func (s *Series) Name() string {
	return "series"
}
