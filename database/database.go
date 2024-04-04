package database

import (
	"crypto/rand"
	"crypto/sha256"
	"github.com/glebarez/sqlite"
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

func LoadAllSeries(
	db *gorm.DB,
	seriesNames []string,
) (map[string]*Series, error) {
	seriesMap, err := loadSeries(db)
	if err != nil {
		return nil, errors.Wrap(err, "initial load")
	}

	for _, name := range seriesNames {
		if _, found := seriesMap[name]; found {
			continue
		}
		db.Create(&Series{
			ID:   hashedID(name),
			Name: name,
			Unit: "",
		})
	}

	return loadSeries(db)
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

func LoadDataWindow(
	db *gorm.DB,
	seriesNames []string,
	start time.Time,
) ([]Value, error) {
	var result []Value

	seriesIDs := make([][]byte, len(seriesNames))
	for i, name := range seriesNames {
		seriesIDs[i] = hashedID(name)
	}

	tx := db.Preload("Series").Where(
		"series_id IN ? and timestamp >= ?",
		seriesIDs,
		start,
	).Order("timestamp asc").Find(&result)
	if tx.Error != nil {
		return nil, errors.Wrap(tx.Error, "find")
	}

	return result, nil
}
