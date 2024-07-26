package database

//func TestMigrate(t *testing.T) {
//	errCh := make(chan error)
//
//	db, err := Get(os.ExpandEnv("$HOME/.z2/z2.db"), errCh)
//	require.NoError(t, err)
//
//	fmt.Println(time.UnixMilli(1717791885643))
//
//	for {
//		var rows []Sample
//		orm := db.GetORM()
//		tx := orm.Where("timestamp_milli is null").Limit(100).Find(&rows)
//		require.NoError(t, tx.Error)
//
//		fmt.Println(len(rows))
//		if len(rows) == 0 {
//			break
//		}
//
//		err = orm.Transaction(func(tx *gorm.DB) error {
//			for _, row := range rows {
//				row.TimestampMilli = sql.NullInt64{
//					Int64: row.Timestamp.UnixMilli(),
//					Valid: true,
//				}
//				tx.Save(row)
//			}
//			return nil
//		})
//		require.NoError(t, err)
//	}
//}
