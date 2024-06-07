package database

import (
	"github.com/pkg/errors"
	"gorm.io/gorm"
	"time"
)

type object struct {
	obj       any
	operation string // {insert, save}
}

func (b *Backend) Insert(obj any) {
	b.objects <- object{
		obj:       obj,
		operation: "insert",
	}
}

func (b *Backend) Save(obj any) {
	b.objects <- object{
		obj:       obj,
		operation: "save",
	}
}

func (b *Backend) insert(objects []object) error {
	err := b.db.Transaction(func(tx *gorm.DB) error {
		for _, row := range objects {
			var res *gorm.DB
			switch row.operation {
			case "insert":
				res = tx.Create(row.obj)
			case "save":
				res = tx.Save(row.obj)
			default:
				return errors.New("unknown operation")
			}
			if res.Error != nil {
				return errors.Wrap(res.Error, row.operation)
			}
		}
		return nil
	})
	return err
}

func (b *Backend) RunWriter() {
	ticker := time.NewTicker(100 * time.Millisecond)

	var rows []object

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
