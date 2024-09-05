//go:build !wasm

package sqlite

import (
	"github.com/chrispappas/golang-generics-set/set"
	"github.com/glebarez/sqlite"
	"github.com/minor-industries/rtgraph/schema"
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

func Get(filename string) (*Backend, error) {
	db, err := gorm.Open(sqlite.Open(filename), &gorm.Config{})
	if err != nil {
		return nil, errors.Wrap(err, "open")
	}

	for _, table := range []any{
		&Sample{},
		&Series{},
		&Marker{},
	} {
		err = db.AutoMigrate(table)
		if err != nil {
			return nil, errors.Wrap(err, "migrate measurement")
		}
	}

	return NewBackend(db, 100), nil
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
	seen    set.Set[string]
}

func (b *Backend) GetORM() *gorm.DB {
	return b.db
}

func (b *Backend) InsertValue(seriesName string, timestamp time.Time, value float64) error {
	if !b.seen.Has(seriesName) {
		//fmt.Println("series", strings.ToUpper(hex.EncodeToString(HashedID(seriesName))), seriesName)
		b.seen.Add(seriesName)
	}

	b.Insert(&Sample{
		SeriesID:  HashedID(seriesName),
		Timestamp: timestamp.UnixMilli(),
		Value:     value,
	})
	return nil
}

func NewBackend(
	db *gorm.DB,
	bufSize int,
) *Backend {
	b := &Backend{
		db:      db,
		objects: make(chan object, bufSize),
		seen:    set.FromSlice([]string{}),
	}

	return b
}

func (b *Backend) LoadDate(seriesName string, date string) (schema.Series, error) {
	// TODO: this should be much better at handling different timezones

	t1, err := time.Parse("2006-01-02", date)
	if err != nil {
		return schema.Series{}, errors.Wrap(err, "parse date")
	}
	t2 := t1.AddDate(0, 0, 1)

	q := b.db.Where(
		"series_id = ? and timestamp >= ? and timestamp < ?",
		HashedID(seriesName),
		t1.UnixMilli(),
		t2.UnixMilli(),
	)

	return b.loadDataWindow(seriesName, q)
}

func (b *Backend) LoadDataWindow(seriesName string, start time.Time) (schema.Series, error) {
	q := b.db.Where(
		"series_id = ? and timestamp >= ?",
		HashedID(seriesName),
		start.UnixMilli(),
	)

	return b.loadDataWindow(seriesName, q)
}

func (b *Backend) loadDataWindow(seriesName string, query *gorm.DB) (schema.Series, error) {
	var rows []Sample

	tx := query.Order("timestamp asc").Find(&rows)

	if tx.Error != nil {
		return schema.Series{}, errors.Wrap(tx.Error, "find")
	}

	result := schema.Series{
		SeriesName: seriesName,
	}
	result.Values = make([]schema.Value, len(rows))

	for idx, row := range rows {
		result.Values[idx] = schema.Value{
			Timestamp: time.UnixMilli(row.Timestamp),
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
			ID:   HashedID(name),
			Name: name,
			Unit: "",
		})
	}

	return nil
}
