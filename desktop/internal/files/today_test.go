package files

import (
	"testing"
	"time"
)

// 北京时间 2026-11-19 07:00 = UTC 2026-11-18 23:00：两者不是同一天，
// 「今日」必须按北京时间的自然日切。
func TestTodayRangeIsBeijing(t *testing.T) {
	now := time.Date(2026, 11, 18, 23, 0, 0, 0, time.UTC)
	start, end := todayRange(now)

	if got := start.In(beijing).Format("2006-01-02 15:04"); got != "2026-11-19 00:00" {
		t.Fatalf("今日起点不是北京 0 点: %q", got)
	}
	if got := end.In(beijing).Format("2006-01-02 15:04"); got != "2026-11-20 00:00" {
		t.Fatalf("今日终点不是次日 0 点: %q", got)
	}
}

// 前端展示的是北京时间，统计口径必须跟它对齐，否则卡片上的「今日」和表格里的日期对不上。
func TestCountTodayCrossesBeijingMidnight(t *testing.T) {
	now := time.Date(2026, 11, 18, 23, 0, 0, 0, time.UTC) // 北京 11-19 07:00
	records := []Record{
		{UploadedAt: "2026-11-18T22:00:00Z", Size: 10}, // 北京 11-19 06:00，算今天
		{UploadedAt: "2026-11-18T16:00:00Z", Size: 20}, // 北京 11-19 00:00，算今天（边界）
		{UploadedAt: "2026-11-18T15:59:59Z", Size: 30}, // 北京 11-18 23:59，不算
		{UploadedAt: "不是时间", Size: 40},                 // 旧脏数据，跳过
	}

	count, bytes := countToday(records, now)
	if count != 2 || bytes != 30 {
		t.Fatalf("今日统计错误: count=%d bytes=%d", count, bytes)
	}
}
