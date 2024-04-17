package database

import (
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

func (b *Backend) Insert(obj any) {
	b.objects <- obj
}

func (b *Backend) insert(objects []any) error {
	err := b.db.Transaction(func(tx *gorm.DB) error {
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

func (b *Backend) RunWriter() {
	ticker := time.NewTicker(100 * time.Millisecond)

	var rows []any

	for {
		select {
		case obj := <-b.objects:
			rows = append(rows, obj)
		case <-ticker.C:
			if len(rows) == 0 {
				continue
			}

			err := b.insert(rows)
			rows = nil

			if err != nil {
				b.errCh <- errors.Wrap(err, "transaction")
				return
			}
		}
	}
}
