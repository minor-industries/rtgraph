package computed_series

import (
	"github.com/pkg/errors"
	"strings"
	"time"
)

func trimSpace(parts []string) []string {
	for i, part := range parts {
		parts[i] = strings.TrimSpace(part)
	}
	return parts
}

func Parse(
	s string,
	start time.Time, // TODO: it's weird that we have to pass start in here
) (string, Operator, error) {
	if len(s) == 0 {
		return "", nil, errors.New("empty series")
	}

	mainParts := trimSpace(strings.Split(s, "|"))

	var series string
	{
		seriesParts := trimSpace(strings.Fields(mainParts[0]))
		if len(seriesParts) > 1 {
			return "", nil, errors.New("invalid series name")
		}
		series = seriesParts[0]
	}

	switch len(mainParts) {
	case 1:
		return series, Identity{}, nil
	case 2:
		functionParts := trimSpace(strings.Fields(mainParts[1]))
		if len(functionParts) != 2 {
			return "", nil, errors.New("invalid number of function parameters")
		}

		functionName := functionParts[0]
		switch functionName {
		case "avg":
			duration, err := time.ParseDuration(functionParts[1])
			if err != nil {
				return "", nil, errors.Wrap(err, "parse duration")
			}
			return series, NewComputedSeries(&FcnAvg{}, duration, start), nil
		default:
			return "", nil, errors.New("unknown function name")
		}
	default:
		return "", nil, errors.New("only one function supported for now")
	}
}
