package ledger

import (
	"strconv"
	"strings"
	"time"
)

// 备份文件名形如 invoices-20261119-150631-028.csv（到毫秒）。
//
// 毫秒只能手工拼接：Go 的时间布局里小数秒必须跟在 "." 或 "," 之后，
// "-000" 会被当成字面量 "-000"，导致真实文件名一个都解析不出来。
// 所以这里布局只到秒，毫秒单独处理；生成与解析都走本文件，避免两边格式再漂。
const (
	backupNamePrefix  = "invoices-"
	backupStampLayout = "20060102-150405"
)

// backupName 生成备份文件名。
func backupName(at time.Time) string {
	return backupNamePrefix + at.Format(backupStampLayout) +
		"-" + padMillis(at.Nanosecond()/1000000) + ".csv"
}

func padMillis(ms int) string {
	text := strconv.Itoa(ms)
	for len(text) < 3 {
		text = "0" + text
	}
	return text
}

// backupTime 从文件名里取时间；解析失败说明不是我们生成的文件。
func backupTime(name string) (time.Time, bool) {
	stamp := strings.TrimSuffix(strings.TrimPrefix(name, backupNamePrefix), ".csv")
	if len(stamp) < len(backupStampLayout) {
		return time.Time{}, false
	}

	at, err := time.ParseInLocation(backupStampLayout, stamp[:len(backupStampLayout)], time.Local)
	if err != nil {
		return time.Time{}, false
	}

	// 毫秒可有可无（老版本写的、手工改名去掉毫秒的都要认得）
	rest := stamp[len(backupStampLayout):]
	if rest == "" {
		return at, true
	}
	ms, ok := parseMillis(rest)
	if !ok {
		return time.Time{}, false
	}
	return at.Add(time.Duration(ms) * time.Millisecond), true
}

// parseMillis 解析 "-028" / ".028" 这种毫秒后缀。
func parseMillis(rest string) (int, bool) {
	if len(rest) != 4 || (rest[0] != '-' && rest[0] != '.') {
		return 0, false
	}
	ms, err := strconv.Atoi(rest[1:])
	if err != nil || ms < 0 || ms > 999 {
		return 0, false
	}
	return ms, true
}
