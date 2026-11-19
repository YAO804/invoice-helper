package ledger

import (
	"fmt"
	"time"
)

func newBatch() string {
	now := time.Now()
	return "B" + now.Format("20060102-150405") + "-" + fmt.Sprintf("%03d", now.Nanosecond()/1000000)
}

// beijing 固定东八区：中国没有夏令时，用 FixedZone 既不依赖运行机器的时区设置，
// 也不用 LoadLocation（精简镜像里常常没装 tzdata）。
var beijing = time.FixedZone("CST", 8*60*60)

// nowText 生成录入时间。台账的录入时间只有这一处口径，界面「最近录入」、
// 按录入时间清理都建立在它上面，必须是北京时间，否则换台机器就整体偏 8 小时。
func nowText() string {
	return time.Now().In(beijing).Format("2006-01-02 15:04:05")
}

func fallback(value string, other string) string {
	if value != "" {
		return value
	}
	return other
}
