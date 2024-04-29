package messages

//go:generate msgp

type Series struct {
	Pos        int
	Timestamps []int64
	Values     []float64
}

type Data struct {
	Series []Series `msg:"rows,omitempty"`
	Error  string   `msg:"error,omitempty"`
	Now    uint64   `msg:"now,omitempty"`
}
