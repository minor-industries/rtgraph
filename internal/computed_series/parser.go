package computed_series

import (
	"github.com/pkg/errors"
	"strings"
	"time"
)

func Parse(s string) (SeriesRequest, error) {
	// rower_power,avg,30s

	parts := strings.Split(s, ",")
	for i, s := range parts {
		parts[i] = strings.TrimSpace(s)
	}

	switch len(parts) {
	case 0:
		return SeriesRequest{}, errors.New("empty request")
	case 1:
		return SeriesRequest{SeriesName: parts[0]}, nil
	case 3:
		switch parts[1] {
		case "avg":
			duration, err := time.ParseDuration(parts[2])
			if err != nil {
				return SeriesRequest{}, errors.Wrap(err, "parse duration")
			}
			return SeriesRequest{
				SeriesName: parts[0],
				Function:   parts[1],
				Duration:   duration,
			}, nil
		default:
			return SeriesRequest{}, errors.New("unknown function")
		}
	default:
		return SeriesRequest{}, errors.New("invalid series request")
	}
}
