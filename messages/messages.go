package messages

//go:generate msgp

type Data struct {
	Rows  []interface{} `msg:"rows,omitempty"`
	Error string        `msg:"error,omitempty"`
	Now   uint64        `msg:"now,omitempty"`
}
