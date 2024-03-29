package database

import (
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

type DBWriter struct {
	errCh   chan error
	objects chan any
	db      *gorm.DB
}

func NewDBWriter(
	db *gorm.DB,
	errCh chan error,
	bufSize int,
) *DBWriter {
	return &DBWriter{
		db:      db,
		errCh:   errCh,
		objects: make(chan any, bufSize),
	}
}

func (w *DBWriter) Insert(obj any) {
	w.objects <- obj
}

func (w *DBWriter) Run() {
	ticker := time.NewTicker(100 * time.Millisecond)

	var rows []any

	for {
		select {
		case obj := <-w.objects:
			rows = append(rows, obj)
		case <-ticker.C:
			if len(rows) == 0 {
				continue
			}

			err := w.db.Transaction(func(tx *gorm.DB) error {
				for _, row := range rows {
					res := tx.Create(row)
					if res.Error != nil {
						return errors.Wrap(res.Error, "create")
					}
				}
				return nil
			})

			rows = nil

			if err != nil {
				w.errCh <- errors.Wrap(err, "transaction")
				return
			}
		}
	}
}
