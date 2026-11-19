package ledger

import (
	"testing"
	"time"
)

// 生成的名字必须能被自己解析回来。
//
// 这条以前是漏洞：生成用 "-%03d" 拼毫秒，解析却用 Go 布局 "20060102-150405-000"，
// 而 Go 把 "-000" 当字面量，于是真实备份一个都解析不出来 —— 清理永远删不掉任何东西，
// 而测试因为用同一套错布局造文件，全都"通过"。所以这里直接锁死往返一致。
func TestBackupNameRoundTrip(t *testing.T) {
	base := time.Date(2026, 11, 19, 15, 6, 31, 0, time.Local)
	for _, ms := range []int{0, 7, 28, 415, 999} {
		at := base.Add(time.Duration(ms) * time.Millisecond)
		name := backupName(at)

		parsed, ok := backupTime(name)
		if !ok {
			t.Fatalf("自己生成的名字应能解析: %s", name)
		}
		if !parsed.Equal(at) {
			t.Fatalf("解析回来的时间不一致: name=%s 期望 %v 实际 %v", name, at, parsed)
		}
	}
}

func TestBackupNamePadsMillis(t *testing.T) {
	at := time.Date(2026, 11, 19, 15, 6, 31, 7*1000000, time.Local) // 第 7 毫秒
	if got := backupName(at); got != "invoices-20261119-150631-007.csv" {
		t.Fatalf("毫秒应补足三位: %s", got)
	}
}

// 老版本写的、以及没有毫秒的名字都要认得，否则用户机器上已有的备份永远清不掉。
func TestBackupTimeAcceptsLegacyNames(t *testing.T) {
	base := time.Date(2026, 11, 19, 14, 20, 41, 0, time.Local)
	cases := map[string]time.Duration{
		"invoices-20261119-142041-415.csv": 415 * time.Millisecond,
		"invoices-20261119-142041.csv":     0,
		"invoices-20261119-142041.415.csv": 415 * time.Millisecond,
	}
	for name, offset := range cases {
		parsed, ok := backupTime(name)
		if !ok {
			t.Fatalf("应能解析 %s", name)
		}
		if want := base.Add(offset); !parsed.Equal(want) {
			t.Fatalf("%s 解析成 %v，期望 %v", name, parsed, want)
		}
	}
}

func TestBackupTimeRejectsForeignNames(t *testing.T) {
	for _, name := range []string{
		"invoices.csv",
		"invoices-坏名字.csv",
		"invoices-20261119.csv",
		"invoices-20261119-142041-9999.csv",
		"invoices-20261119-142041-abc.csv",
	} {
		if _, ok := backupTime(name); ok {
			t.Fatalf("不该认出的名字被认了: %s", name)
		}
	}
}
