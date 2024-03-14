package messages

//go:generate msgp

type Data struct {
	Rows []interface{}
}
