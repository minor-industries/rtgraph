//go:build wasm

package capacitor_sqlite

import (
	"fmt"
	"github.com/minor-industries/rtgraph/schema"
	"syscall/js"
	"time"
)

type DatabaseManagerWrapper struct {
	dbManager js.Value
}

func NewDatabaseManagerWrapper(dbManager js.Value) (*DatabaseManagerWrapper, error) {
	if dbManager.IsUndefined() {
		return nil, fmt.Errorf("dbManager is not defined in the global scope")
	}
	return &DatabaseManagerWrapper{dbManager: dbManager}, nil
}

func printKeys(jsObject js.Value) {
	// Get the keys of the object
	keys := js.Global().Get("Object").Call("keys", jsObject)

	// Iterate over the keys and print them
	for i := 0; i < keys.Length(); i++ {
		key := keys.Index(i).String()
		value := jsObject.Get(key)
		fmt.Printf("Key: %s, Value: %v\n", key, value)
	}
}

func (dmw *DatabaseManagerWrapper) LoadDataWindow(seriesName string, start time.Time) (schema.Series, error) {
	promise := dmw.dbManager.Call("loadDataWindow", seriesName, start.UnixMilli())

	dbResult := await(promise)
	//fmt.Println("DB Result received:", dbResult.Length())

	if dbResult.IsUndefined() || dbResult.Type() != js.TypeObject {
		return schema.Series{}, fmt.Errorf("failed to load data window: result is undefined or not an object")
	}

	// Assuming dbResult is an array
	result := schema.Series{
		SeriesName: seriesName,
	}
	result.Values = make([]schema.Value, dbResult.Length())

	for i := 0; i < dbResult.Length(); i++ {
		row := dbResult.Index(i)
		//printKeys(row)

		result.Values[i] = schema.Value{
			Timestamp: time.UnixMilli(int64(row.Get("timestamp").Int())),
			Value:     row.Get("value").Float(),
		}
	}

	return result, nil
}

func (dmw *DatabaseManagerWrapper) LoadDate(seriesName string, date string) (schema.Series, error) {
	// Implement based on the structure of the DatabaseManager
	return schema.Series{}, fmt.Errorf("LoadDate is not implemented")
}

func (dmw *DatabaseManagerWrapper) CreateSeries(seriesNames []string) error {
	if len(seriesNames) == 0 {
		return nil
	}

	jsArray := js.ValueOf(seriesNames)
	promise := dmw.dbManager.Call("createSeries", jsArray)

	result := await(promise)
	if !result.Truthy() {
		return fmt.Errorf("failed to create series")
	}

	return nil
}

func (dmw *DatabaseManagerWrapper) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	//fmt.Println("insertValue", seriesName, timestamp.UnixMilli(), value)
	promise := dmw.dbManager.Call("insertValue", seriesName, timestamp.UnixMilli(), value)

	result := await(promise)
	if !result.Truthy() {
		//fmt.Println("dmw: failed to insert value")
		return fmt.Errorf("failed to insert value")
	}

	//fmt.Println("dmw: inserted value")
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
