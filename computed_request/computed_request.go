package computed_request

import "fmt"

type ComputedReq struct {
	SeriesName string
	Function   string
	Seconds    uint
}

func (req *ComputedReq) OutputSeriesName() string {
	return fmt.Sprintf("%s_%s_%ds", req.SeriesName, req.Function, req.Seconds)
}

func (req *ComputedReq) InputSeriesName() string {
	return req.SeriesName
}
