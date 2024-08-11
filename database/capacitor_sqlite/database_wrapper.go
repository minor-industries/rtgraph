//go:build wasm

package capacitor_sqlite

import (
	"fmt"
	"syscall/js"
	"time"
)

type Value struct {
	Timestamp time.Time
	Value     float64
}

type DatabaseManagerWrapper struct {
	dbManager js.Value
}

func NewDatabaseManagerWrapper(dbManager js.Value) (*DatabaseManagerWrapper, error) {
	if dbManager.IsUndefined() {
		return nil, fmt.Errorf("dbManager is not defined in the global scope")
	}
	return &DatabaseManagerWrapper{dbManager: dbManager}, nil
}

func (dmw *DatabaseManagerWrapper) LoadDataWindow(seriesName string, start time.Time) ([]Value, error) {
	promise := dmw.dbManager.Call("loadDataWindow", seriesName, start.Unix())

	result := await(promise)
	if !result.Truthy() {
		return nil, fmt.Errorf("failed to load data window")
	}

	rows := result.Get("rows")
	values := make([]Value, rows.Length())
	for i := 0; i < rows.Length(); i++ {
		row := rows.Index(i)
		values[i] = Value{
			Timestamp: time.UnixMilli(int64(row.Get("Timestamp").Int())),
			Value:     row.Get("Value").Float(),
		}
	}
	return values, nil
}

func (dmw *DatabaseManagerWrapper) LoadDate(seriesName string, date string) ([]Value, error) {
	// Implement based on the structure of the DatabaseManager
	return nil, fmt.Errorf("LoadDate is not implemented")
}

func (dmw *DatabaseManagerWrapper) CreateSeries(seriesNames []string) error {
	jsArray := js.ValueOf(seriesNames)
	promise := dmw.dbManager.Call("createSeries", jsArray)

	result := await(promise)
	if !result.Truthy() {
		return fmt.Errorf("failed to create series")
	}

	return nil
}

func (dmw *DatabaseManagerWrapper) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	promise := dmw.dbManager.Call("insertValue", seriesName, timestamp.Unix(), value)

	result := await(promise)
	if !result.Truthy() {
		return fmt.Errorf("failed to insert value")
	}

	return nil
}

// await converts a JavaScript Promise into a synchronous call for Go
func await(promise js.Value) js.Value {
	done := make(chan struct{})
	var result js.Value

	thenFunc := js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		result = args[0]
		close(done)
		return nil
	})

	promise.Call("then", thenFunc)

	<-done
	return result
}
