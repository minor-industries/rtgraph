package schema

import "time"

type Series struct {
	SeriesName string
	Timestamp  time.Time
	Value      float64
}

func (s *Series) Name() string {
	return "series"
}
