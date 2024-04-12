package rtgraph

import (
	"github.com/minor-industries/platform/common/metrics"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"github.com/prometheus/client_golang/prometheus"
	"time"
)

func (g *Graph) publishPrometheusMetrics() {
	metricMap := map[string]*metrics.TimeoutGauge{}

	msgCh := g.broker.Subscribe()

	for message := range msgCh {
		switch m := message.(type) {
		case schema.Series:
			fullName := "rtgraph_" + m.SeriesName
			if _, ok := metricMap[fullName]; !ok {
				tg := metrics.NewTimeoutGauge(15*time.Second, prometheus.GaugeOpts{
					Name: fullName,
				})
				metricMap[fullName] = tg
				err := prometheus.Register(tg.G)
				if err != nil {
					g.errCh <- errors.Wrap(err, "register prometheus metric")
				}
			}

			if len(m.Values) == 0 {
				continue
			}

			lastPoint := m.Values[len(m.Values)-1]
			metricMap[fullName].Set(lastPoint.Value)
		}
	}
}
