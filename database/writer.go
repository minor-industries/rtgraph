package database

import (
	"github.com/minor-industries/rtgraph/storage"
	"github.com/pkg/errors"
	"time"
)

type DBWriter struct {
	errCh   chan error
	objects chan any
	db      storage.StorageBackend
}

func NewDBWriter(
	db storage.StorageBackend,
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

			err := w.db.Insert(rows)
			rows = nil

			if err != nil {
				w.errCh <- errors.Wrap(err, "transaction")
				return
			}
		}
	}
}
