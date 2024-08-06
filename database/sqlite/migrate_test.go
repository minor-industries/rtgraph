//go:build !wasm

package sqlite

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type Sample struct {
	Id          []byte `gorm:"primaryKey"`
	SeriesID    []byte
	Timestamp   time.Time
	Value       float64
	TimestampMS int64
}

func TestUpdateTimestampMS(t *testing.T) {
	t.Skip()
	db, err := gorm.Open(sqlite.Open(os.ExpandEnv("$HOME/z2.db")), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(&Sample{})
	require.NoError(t, err)

	var samples []Sample
	err = db.Find(&samples).Error
	fmt.Println(len(samples))
	require.NoError(t, err)

	tx := db.Begin()
	require.NoError(t, tx.Error)

	for i, sample := range samples {
		samples[i].TimestampMS = sample.Timestamp.UnixMilli()
		err = tx.Save(&samples[i]).Error
		require.NoError(t, err)
	}

	err = tx.Commit().Error
	require.NoError(t, err)
}
