package ledger

import (
	"fmt"
	"time"
)

func newBatch() string {
	now := time.Now()
	return "B" + now.Format("20060102-150405") + "-" + fmt.Sprintf("%03d", now.Nanosecond()/1000000)
}

func nowText() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

func fallback(value string, other string) string {
	if value != "" {
		return value
	}
	return other
}
