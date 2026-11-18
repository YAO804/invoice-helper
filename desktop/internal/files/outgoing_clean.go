package files

import "time"

// DeleteOutgoingMany 按文件名批量删除待取文件。
// 单个删不掉不影响其余，返回成功数与第一个错误。
func (s *Store) DeleteOutgoingMany(names []string) (int, error) {
	removed := 0
	var firstErr error
	for _, name := range names {
		if name == "" {
			continue
		}
		path, ok := s.OutgoingPath(name)
		if !ok {
			continue
		}
		if err := removeFile(path); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		removed++
	}
	return removed, firstErr
}

// DeleteAllOutgoing 清空待取区。
func (s *Store) DeleteAllOutgoing() (int, error) {
	list, err := s.ListOutgoing()
	if err != nil {
		return 0, err
	}
	names := make([]string, 0, len(list))
	for _, item := range list {
		names = append(names, item.Name)
	}
	return s.DeleteOutgoingMany(names)
}

// CountOutgoingOlderThan 只数不删，用于清理前预览。
func (s *Store) CountOutgoingOlderThan(keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	list, err := s.ListOutgoing()
	if err != nil {
		return 0, err
	}

	count := 0
	for _, item := range list {
		if outgoingExpired(item, keepDays) {
			count++
		}
	}
	return count, nil
}

// PurgeOutgoingOlderThan 按修改时间清理待取文件。keepDays <= 0 表示不清理。
//
// 待取区是"电脑给小程序"的中转站，副本过期就删；源文件还在用户原来放的位置，
// 所以这里的删除不会让用户丢东西。
func (s *Store) PurgeOutgoingOlderThan(keepDays int) (int, error) {
	if keepDays <= 0 {
		return 0, nil
	}
	list, err := s.ListOutgoing()
	if err != nil {
		return 0, err
	}

	expired := []string{}
	for _, item := range list {
		if outgoingExpired(item, keepDays) {
			expired = append(expired, item.Name)
		}
	}
	return s.DeleteOutgoingMany(expired)
}

// outgoingExpired 与 incoming 同一口径：时间读不出来就不删，宁可留。
func outgoingExpired(item OutgoingFile, keepDays int) bool {
	at, err := time.Parse(time.RFC3339, item.ModifiedAt)
	if err != nil {
		return false
	}
	return time.Since(at) > time.Duration(keepDays)*24*time.Hour
}
