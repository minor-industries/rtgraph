package database

import (
	"time"
)

type Value struct {
	ID        []byte `gorm:"primary_key"`
	Timestamp int64  `gorm:"index;not null"`
	Value     float64
	SeriesID  []byte `gorm:"index;not null"`
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

	Timestamp time.Time `gorm:"index"`
	Message   []byte
}
