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

func Get(filename string) (*gorm.DB, error) {
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
	return db, nil
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
	*gorm.DB
}

func (b *Backend) LoadDataWindow(
	seriesNames []string,
	start time.Time,
) ([]schema.Series, error) {
	var rows []Value

	seriesIDs := make([][]byte, len(seriesNames))
	for i, name := range seriesNames {
		seriesIDs[i] = hashedID(name)
	}

	tx := b.DB.Preload("Series").Where(
		"series_id IN ? and timestamp >= ?",
		seriesIDs,
		start,
	).Order("timestamp asc").Find(&rows)
	if tx.Error != nil {
		return nil, errors.Wrap(tx.Error, "find")
	}

	result := make([]schema.Series, len(rows))
	for idx, row := range rows {
		result[idx] = schema.Series{
			SeriesName: row.Series.Name,
			Timestamp:  row.Timestamp,
			Value:      row.Value,
		}
	}

	return result, nil
}

func (b *Backend) CreateSeries(
	seriesNames []string,
) error {
	seriesMap, err := loadSeries(b.DB)
	if err != nil {
		return errors.Wrap(err, "initial load")
	}

	for _, name := range seriesNames {
		if _, found := seriesMap[name]; found {
			continue
		}
		b.DB.Create(&Series{
			ID:   hashedID(name),
			Name: name,
			Unit: "",
		})
	}

	return nil
}

func (b *Backend) Insert(objects []any) error {
	err := b.DB.Transaction(func(tx *gorm.DB) error {
		for _, row := range objects {
			res := tx.Create(row)
			if res.Error != nil {
				return errors.Wrap(res.Error, "create")
			}
		}
		return nil
	})
	return err
}
