package files

import "time"

// PurgeOlderThan 删除接收时间早于 keepDays 天的记录与文件。keepDays <= 0 表示不清理。
func (s *Store) PurgeOlderThan(keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	return s.removeWhere(func(record Record) bool {
		return olderThan(record, keepDays)
	})
}

// CountOlderThan 只数不改，用于清理前的预览。
func (s *Store) CountOlderThan(keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	records, err := s.loadRecords()
	if err != nil {
		return 0, err
	}
	count := 0
	for _, record := range records {
		if olderThan(record, keepDays) {
			count++
		}
	}
	return count, nil
}

// DeleteIncomingMany 按 id 批量删除。
func (s *Store) DeleteIncomingMany(ids []string) (int, error) {
	wanted := map[string]bool{}
	for _, id := range ids {
		if id != "" {
			wanted[id] = true
		}
	}
	if len(wanted) == 0 {
		return 0, nil
	}
	return s.removeWhere(func(record Record) bool {
		return wanted[record.ID]
	})
}

// DeleteAllIncoming 清空接收文件。
func (s *Store) DeleteAllIncoming() (int, error) {
	return s.removeWhere(func(Record) bool { return true })
}

func olderThan(record Record, keepDays int) bool {
	at, err := time.Parse(time.RFC3339, record.UploadedAt)
	if err != nil {
		// 时间读不出来的记录不自动删，留给用户手动处理，避免误删
		return false
	}
	return time.Since(at) > time.Duration(keepDays)*24*time.Hour
}

// removeWhere 删除命中条件的记录及其文件。
// 单个文件删不掉时保留记录并记下第一个错误，其余继续删——批量清理不该因为一个坏文件整批停下。
func (s *Store) removeWhere(match func(Record) bool) (int, error) {
	records, err := s.loadRecords()
	if err != nil {
		return 0, err
	}

	kept := []Record{}
	removed := 0
	var firstErr error
	for _, record := range records {
		if !match(record) {
			kept = append(kept, record)
			continue
		}
		if err := removeFile(s.IncomingRecordPath(record)); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			kept = append(kept, record)
			continue
		}
		removed++
	}

	if removed == 0 {
		return 0, firstErr
	}
	return removed, s.saveRecords(kept)
}
