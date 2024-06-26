package database

import (
	"crypto/rand"
	"crypto/sha256"
	"github.com/glebarez/sqlite"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

func Get(filename string, errCh chan error) (*Backend, error) {
	db, err := gorm.Open(sqlite.Open(filename), &gorm.Config{})
	if err != nil {
		return nil, errors.Wrap(err, "open")
	}

	for _, table := range []any{
		&Value{},
		&Series{},
		&RawValue{},
	} {
		err = db.AutoMigrate(table)
		if err != nil {
			return nil, errors.Wrap(err, "migrate measurement")
		}
	}

	return NewBackend(db, errCh, 100), nil
}

func RandomID() []byte {
	var result [16]byte
	_, err := rand.Read(result[:])
	if err != nil {
		panic(err)
	}
	return result[:]
}

func hashedID(s string) []byte {
	var result [16]byte
	h := sha256.New()
	h.Write([]byte(s))
	sum := h.Sum(nil)
	copy(result[:], sum[:16])
	return result[:]
}

func loadSeries(db *gorm.DB) (map[string]*Series, error) {
	typeMap := map[string]*Series{}
	{
		var types []*Series
		tx := db.Find(&types)
		if tx.Error != nil {
			return nil, errors.Wrap(tx.Error, "find")
		}

		for _, mt := range types {
			typeMap[mt.Name] = mt
		}
	}

	return typeMap, nil
}

type Backend struct {
	db *gorm.DB

	objects chan object
	errCh   chan error
}

func (b *Backend) GetORM() *gorm.DB {
	return b.db
}

func (b *Backend) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	b.Insert(&Value{
		ID:        RandomID(),
		Timestamp: timestamp,
		Value:     value,
		SeriesID:  hashedID(seriesName),
	})
	return nil
}

func NewBackend(
	db *gorm.DB,
	errCh chan error,
	bufSize int,
) *Backend {
	b := &Backend{
		db:      db,
		objects: make(chan object, bufSize),
		errCh:   errCh,
	}

	go b.RunWriter()

	return b
}

func (b *Backend) LoadDataWindow(
	seriesName string,
	start time.Time,
) (schema.Series, error) {
	var rows []Value

	tx := b.db.Preload("Series").Where(
		"series_id = ? and timestamp >= ?",
		hashedID(seriesName),
		start,
	).Order("timestamp asc").Find(&rows)
	if tx.Error != nil {
		return schema.Series{}, errors.Wrap(tx.Error, "find")
	}

	result := schema.Series{
		SeriesName: seriesName,
	}
	result.Values = make([]schema.Value, len(rows))

	for idx, row := range rows {
		result.Values[idx] = schema.Value{
			Timestamp: row.Timestamp,
			Value:     row.Value,
		}
	}

	return result, nil
}

func (b *Backend) CreateSeries(
	seriesNames []string,
) error {
	seriesMap, err := loadSeries(b.db)
	if err != nil {
		return errors.Wrap(err, "initial load")
	}

	for _, name := range seriesNames {
		if _, found := seriesMap[name]; found {
			continue
		}
		b.db.Create(&Series{
			ID:   hashedID(name),
			Name: name,
			Unit: "",
		})
	}

	return nil
}
