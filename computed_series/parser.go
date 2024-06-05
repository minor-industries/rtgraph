package computed_series

import (
	"github.com/pkg/errors"
	"strconv"
	"strings"
	"time"
)

type Parser struct {
	functions map[string]FunctionParser
}

var builtInParsers = map[string]FunctionParser{
	"avg": func(start time.Time, args []string) (Operator, error) {
		duration, err := time.ParseDuration(args[0])
		if err != nil {
			return nil, errors.Wrap(err, "parse duration")
		}
		switch len(args) {
		case 1:
			return NewComputedSeries(&FcnAvg{}, duration, start), nil
		case 2:
			switch args[1] {
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
	},

	"gt": func(start time.Time, args []string) (Operator, error) {
		x, err := strconv.ParseFloat(args[0], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return OpGt{X: x}, nil
	},

	"add": func(start time.Time, args []string) (Operator, error) {
		x, err := strconv.ParseFloat(args[0], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return OpAdd{X: x}, nil
	},

	"CtoF": func(start time.Time, args []string) (Operator, error) {
		return OpCtoF{}, nil
	},

	"gate": func(start time.Time, args []string) (Operator, error) {
		if len(args) != 2 {
			return nil, errors.New("gate: invalid number of function parameters")
		}
		duration, err := time.ParseDuration(args[0])
		if err != nil {
			return nil, errors.Wrap(err, "parse duration")
		}
		target, err := strconv.ParseFloat(args[1], 64)
		if err != nil {
			return nil, errors.Wrap(err, "invalid float")
		}
		return NewComputedSeries(&FcnGate{
			target: target,
		}, duration, start), nil
	},
}

func NewParser() *Parser {
	return &Parser{
		functions: builtInParsers,
	}
}

func (p *Parser) AddFunction(name string, parser FunctionParser) {
	p.functions[name] = parser
}

type FunctionParser func(start time.Time, args []string) (Operator, error)

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
	fields := trimSpace(strings.Fields(def))

	if len(fields) == 0 {
		return nil, errors.New("invalid number of function parameters")
	}

	functionName := fields[0]
	parser, ok := p.functions[functionName]
	if !ok {
		return nil, errors.New("unknown function name")
	}

	return parser(start, fields[1:])
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

	return Chain{ops: ops}, nil
}
