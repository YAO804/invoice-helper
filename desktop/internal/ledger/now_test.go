package ledger

import (
	"testing"
	"time"
)

// 录入时间是界面上「最近录入」和按录入时间清理的唯一依据，
// 必须固定北京时间：把本机时区改成 UTC 后仍然不能偏 8 小时。
func TestNowTextIsBeijing(t *testing.T) {
	old := time.Local
	time.Local = time.UTC
	defer func() { time.Local = old }()

	before := time.Now()
	got := nowText()
	after := time.Now()

	parsed, err := time.ParseInLocation("2006-01-02 15:04:05", got, beijing)
	if err != nil {
		t.Fatalf("录入时间格式不对: %q", got)
	}
	// 生成期间可能跨秒，留 1 秒余量；时区错了会差 8 小时，余量挡不住
	if parsed.Before(before.In(beijing).Add(-time.Second)) ||
		parsed.After(after.In(beijing).Add(time.Second)) {
		t.Fatalf("录入时间不是北京时间: %q", got)
	}
}
