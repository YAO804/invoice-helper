package files

import (
	"time"
)

// beijing 与台账同一口径：中国没有夏令时，固定东八区，不依赖机器时区设置。
var beijing = time.FixedZone("CST", 8*60*60)

type Stats struct {
	IncomingCount int   `json:"incoming_count"`
	IncomingBytes int64 `json:"incoming_bytes"`
	OutgoingCount int   `json:"outgoing_count"`
	OutgoingBytes int64 `json:"outgoing_bytes"`
	TodayCount    int   `json:"today_count"`
	TodayBytes    int64 `json:"today_bytes"`
}

func (s *Store) Stats() (Stats, error) {
	incoming, err := s.ListRecords()
	if err != nil {
		return Stats{}, err
	}
	outgoing, err := s.ListOutgoing()
	if err != nil {
		return Stats{}, err
	}

	stats := Stats{
		IncomingCount: len(incoming),
		OutgoingCount: len(outgoing),
	}
	stats.TodayCount, stats.TodayBytes = countToday(incoming, time.Now())

	for _, record := range incoming {
		stats.IncomingBytes += record.Size
	}
	for _, item := range outgoing {
		stats.OutgoingBytes += item.Size
	}
	return stats, nil
}

// todayRange 返回北京时间今天 0 点到明天 0 点，用于 [start, end) 判区间。
//
// 不能用字符串前缀比 UTC 日期：上传时间存的是 UTC，而用户看的是北京时间，
// 在北京时间 00:00–08:00 之间两者不是同一天，卡片上的「今日接收」会算错一天。
func todayRange(now time.Time) (time.Time, time.Time) {
	local := now.In(beijing)
	start := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, beijing)
	return start, start.Add(24 * time.Hour)
}

// 统计今天（北京时间）接收的文件；解析不出时间的旧记录直接不计，不能让它把统计打挂
func countToday(records []Record, now time.Time) (int, int64) {
	start, end := todayRange(now)
	count := 0
	var bytes int64
	for _, record := range records {
		at, err := time.Parse(time.RFC3339, record.UploadedAt)
		if err != nil || at.Before(start) || !at.Before(end) {
			continue
		}
		count++
		bytes += record.Size
	}
	return count, bytes
}
