package database

type Sample struct {
	SeriesID  []byte `gorm:"primaryKey;index"`
	Timestamp int64  `gorm:"primaryKey;index"`
	Value     float64
}

type Series struct {
	ID   []byte `gorm:"primary_key"`
	Name string `gorm:"unique"`
	Unit string
}
