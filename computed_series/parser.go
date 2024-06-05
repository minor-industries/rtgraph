package computed_series

import (
	"github.com/pkg/errors"
	"strconv"
	"strings"
	"time"
)

type Parser struct {
}

func NewParser() *Parser {
	return &Parser{}
}

func trimSpace(parts []string) []string {
	for i, part := range parts {
		parts[i] = strings.TrimSpace(part)
	}
	return parts
}

func (p *Parser) Parse(
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
		op, err := p.parseFunction(start, mainParts[1])
		return series, op, err
	default:
		op, err := p.parseChain(start, mainParts[1:])
		return series, op, err
	}
}

func (p *Parser) parseFunction(
	start time.Time,
	def string,
) (Operator, error) {
	functionParts := trimSpace(strings.Fields(def))

	if len(functionParts) == 0 {
		return nil, errors.New("invalid number of function parameters")
	}

	functionName := functionParts[0]
	switch functionName {
	case "avg":
		duration, err := time.ParseDuration(functionParts[1])
		if err != nil {
			return nil, errors.Wrap(err, "parse duration")
		}
		switch len(functionParts) {
		case 2:
			return NewComputedSeries(&FcnAvg{}, duration, start), nil
		case 3:
			switch functionParts[2] {
			case "triangle":
				return NewComputedSeries(&FcnAvgWindow{
					duration: duration,
					scale:    1.0 / float64(duration),
				}, duration, start), nil
			}
			return nil, errors.New("unknown window")
		default:
			return nil, errors.New("avg: invalid number of function parameters")
		}
	case "gt":
		x, err := strconv.ParseFloat(functionParts[1], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return OpGt{X: x}, nil
	case "add":
		x, err := strconv.ParseFloat(functionParts[1], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return OpAdd{X: x}, nil
	case "CtoF":
		return OpCtoF{}, nil
	case "gate":
		if len(functionParts) != 3 {
			return nil, errors.New("gate: invalid number of function parameters")
		}
		duration, err := time.ParseDuration(functionParts[1])
		if err != nil {
			return nil, errors.Wrap(err, "parse duration")
		}
		target, err := strconv.ParseFloat(functionParts[2], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return NewComputedSeries(&FcnGate{
			target: target,
		}, duration, start), nil
	default:
		return nil, errors.New("unknown function name")
	}
}

func (p *Parser) parseChain(
	start time.Time,
	defs []string,
) (Operator, error) {
	var ops []Operator

	for _, def := range defs {
		op, err := p.parseFunction(start, def)
		if err != nil {
			return nil, errors.Wrap(err, "parse function")
		}
		ops = append(ops, op)
	}

	return chain{ops: ops}, nil
}
