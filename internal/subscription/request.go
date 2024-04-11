package subscription

import "time"

type Request struct {
	Series      []string `json:"series"`
	WindowSize  uint64   `json:"windowSize"`
	LastPointMs uint64   `json:"lastPointMs"`
	MaxGapMs    uint64   `json:"maxGapMs"`
}

func (req *Request) Start(now time.Time) time.Time {
	windowSize := time.Duration(req.WindowSize) * time.Millisecond
	windowStart := now.Add(-windowSize)

	if req.LastPointMs != 0 {
		tStartAfter := time.UnixMilli(int64(req.LastPointMs + 1))
		if tStartAfter.After(windowStart) {
			// only use if inside the start window
			return tStartAfter
		}
	}

	return windowStart
}
