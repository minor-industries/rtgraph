package database

type Sample struct {
	SeriesID  []byte `gorm:"primaryKey"`
	Timestamp int64  `gorm:"primaryKey"`
	Value     float64
}

type Series struct {
	ID   []byte `gorm:"primary_key"`
	Name string `gorm:"unique"`
	Unit string
}

type Marker struct {
	ID string `gorm:"primary_key;not null"`

	Type      string `gorm:"index;not null"`
	Ref       string `gorm:"index;not null"`
	Timestamp int64  `gorm:"index;not null"`
}
