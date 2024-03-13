package database

import "time"

type Value struct {
	ID        []byte    `gorm:"primary_key"`
	Timestamp time.Time `gorm:"index:"`
	Value     float64
	SeriesID  []byte
	Series    *Series `gorm:"foreignKey:SeriesID"`
}

type Series struct {
	ID   []byte `gorm:"primary_key"`
	Name string `gorm:"unique"`
	Unit string
}

type RawValue struct {
	ID []byte `gorm:"primary_key"`

	ServiceID        string
	CharacteristicID string

	Timestamp time.Time `gorm:"index:"`
	Message   []byte
}
