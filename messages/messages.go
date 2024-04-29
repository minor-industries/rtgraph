package messages

//go:generate msgp

type Sample struct {
	Timestamp int64
	Value     float64
}

type Series struct {
	Pos     int
	Samples []Sample
}

type Data struct {
	Series []Series `msg:"rows,omitempty"`
	Error  string   `msg:"error,omitempty"`
	Now    uint64   `msg:"now,omitempty"`
}
