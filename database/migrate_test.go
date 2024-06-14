package database

import (
	"fmt"
	"github.com/stretchr/testify/require"
	"os"
	"testing"
	"time"
)

func TestMigrate(t *testing.T) {
	errCh := make(chan error)

	db, err := Get(os.ExpandEnv("$HOME/z2.db"), errCh)
	require.NoError(t, err)

	var rows []Value
	tx := db.GetORM().Order("timestamp desc").Limit(100).Find(&rows)
	require.NoError(t, tx.Error)

	location, err := time.LoadLocation("Local")
	require.NoError(t, err)

	now := time.Now().In(location)
	zoneName, _ := now.Zone()

	fmt.Println(zoneName)

	for _, row := range rows {
		ts := row.Timestamp.UnixMilli()
		t2 := time.UnixMilli(ts)

		loc, err := time.LoadLocation("America/Los_Angeles")
		require.NoError(t, err)

		t3 := t2.In(loc)

		fmt.Println(row.Timestamp, row.Timestamp.UnixMilli(), t2.UTC(), t3)
	}
}
