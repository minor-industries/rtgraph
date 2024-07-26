package database

type Sample struct {
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
