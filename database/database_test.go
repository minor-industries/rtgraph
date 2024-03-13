package database_test

import (
	"fmt"
	"github.com/google/uuid"
	database2 "github.com/minor-industries/rtgraph/database"
	"github.com/stretchr/testify/require"
	"os"
	"testing"
	"time"
)

/*
InstantSpeed: (float64) 35.6,
 AverageSpeed: (float64) 0,
 InstantCadence: (float64) 54,
 AverageCadence: (float64) 0,
 TotalDistance: (float64) 140,
 ResistanceLevel: (float64) 0,
 InstantPower: (float64) 200,
 AveragePower: (float64) 0,
 TotalEnergy: (float64) 3,
 EnergyPerHour: (float64) 0,
 EnergyPerMinute: (float64) 0,
 HeartRate: (float64) 0,
 MetabolicEquivalent: (float64) 0,
 ElapsedTime: (float64) 0,
 RemainingTime: (float64) 0

instant_speed: (float64) 35.6,
average_speed: (float64) 0,
instant_cadence: (float64) 54,
average_cadence: (float64) 0,
total_distance: (float64) 140,
resistance_level: (float64) 0,
instant_power: (float64) 200,
average_power: (float64) 0,
total_energy: (float64) 3,
energy_per_hour: (float64) 0,
energy_per_minute: (float64) 0,
heart_rate: (float64) 0,
metabolic_equivalent: (float64) 0,
elapsed_time: (float64) 0,
remaining_time: (float64) 0
*/

func TestGet(t *testing.T) {
	dbname := os.ExpandEnv("$HOME/bike.db")
	fmt.Println(dbname)
	db, err := database2.Get(dbname)
	require.NoError(t, err)

	seriesMap, err := database2.loadSeries(db)
	require.NoError(t, err)

	t.Run("create types", func(t *testing.T) {
		names := []string{
			"bike_instant_speed",
			"bike_instant_cadence",
			"bike_total_distance",
			"bike_resistance_level",
			"bike_instant_power",
			"bike_total_energy",
			"bike_energy_per_hour",
			"bike_energy_per_minute",
			"bike_heartrate",
		}

		for _, name := range names {
			if _, found := seriesMap[name]; found {
				continue
			}
			db.Create(&database2.Series{
				Name: name,
				Unit: "",
			})
		}
	})

	seriesMap, err = database2.loadSeries(db)
	require.NoError(t, err)

	t.Run("measurement", func(t *testing.T) {
		m := &database2.Value{
			ID:        uuid.New(),
			Timestamp: time.Now(),
			Value:     55,
			Series:    seriesMap["bike_instant_cadence"],
		}
		tx := db.Create(m)
		require.NoError(t, tx.Error)
	})
}
