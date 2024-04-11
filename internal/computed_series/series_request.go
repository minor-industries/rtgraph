package computed_series

import (
	"fmt"
	"time"
)

type SeriesRequest struct {
	SeriesName string
	Function   string
	Duration   time.Duration
}

func (req *SeriesRequest) OutputSeriesName() string {
	return fmt.Sprintf("%s_%s_%s", req.SeriesName, req.Function, req.Duration.String())
}
