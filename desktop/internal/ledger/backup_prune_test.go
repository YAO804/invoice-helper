package ledger

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// newBackupDir 造一个只含备份文件的目录，文件名用真实格式，时间按需偏移。
func newBackupDir(t *testing.T, stamps ...time.Time) string {
	t.Helper()
	dir := t.TempDir()
	for _, at := range stamps {
		if err := os.WriteFile(filepath.Join(dir, backupName(at)), []byte("x"), 0644); err != nil {
			t.Fatalf("造备份失败: %v", err)
		}
	}
	return dir
}

func countBackups(t *testing.T, dir string) int {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, entry := range entries {
		if isBackupName(entry.Name()) {
			count++
		}
	}
	return count
}

func TestPruneKeepsRecentBackups(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	// 最近 7 天内：一天连改 5 次，5 份都要留，出事时才能逐步回退
	dir := newBackupDir(t,
		now.Add(-1*time.Hour), now.Add(-2*time.Hour), now.Add(-3*time.Hour),
		now.Add(-26*time.Hour), now.Add(-27*time.Hour),
	)

	removed, err := pruneBackups(dir, now, DefaultBackupPolicy(90))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 || countBackups(t, dir) != 5 {
		t.Fatalf("7 天内的备份应全部保留: removed=%d left=%d", removed, countBackups(t, dir))
	}
}

func TestPruneKeepsOnePerDayBeyondRecent(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	// 20 天前同一天 3 份、30 天前同一天 2 份：各留当天最后一份
	day20 := time.Date(2026, 10, 30, 0, 0, 0, 0, time.Local)
	day30 := time.Date(2026, 10, 20, 0, 0, 0, 0, time.Local)
	dir := newBackupDir(t,
		day20.Add(1*time.Hour), day20.Add(5*time.Hour), day20.Add(9*time.Hour),
		day30.Add(1*time.Hour), day30.Add(7*time.Hour),
	)

	removed, err := pruneBackups(dir, now, DefaultBackupPolicy(90))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 3 {
		t.Fatalf("每天应只留一份，应删 3 份，实际 %d", removed)
	}
	if countBackups(t, dir) != 2 {
		t.Fatalf("应剩 2 份（各天最后一份），实际 %d", countBackups(t, dir))
	}

	// 留下的必须是当天最晚的那份，而不是最早的那份
	for _, want := range []string{"invoices-20261030-090000-000.csv", "invoices-20261020-070000-000.csv"} {
		if _, err := os.Stat(filepath.Join(dir, want)); err != nil {
			t.Fatalf("应保留当天最后一份 %s: %v", want, err)
		}
	}
}

func TestPruneDropsExpiredBackups(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	dir := newBackupDir(t,
		now.AddDate(0, 0, -3),   // 近期，留
		now.AddDate(0, 0, -100), // 超过 90 天，删
		now.AddDate(0, 0, -400), // 更久，删
	)

	removed, err := pruneBackups(dir, now, DefaultBackupPolicy(90))
	if err != nil {
		t.Fatal(err)
	}
	if removed != 2 || countBackups(t, dir) != 1 {
		t.Fatalf("超期备份应删除: removed=%d left=%d", removed, countBackups(t, dir))
	}
}

func TestPruneHonorsMaxFiles(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	stamps := make([]time.Time, 0, 10)
	for i := 0; i < 10; i++ {
		stamps = append(stamps, now.Add(-time.Duration(i)*time.Minute))
	}
	dir := newBackupDir(t, stamps...)

	policy := DefaultBackupPolicy(90)
	policy.MaxFiles = 4
	removed, err := pruneBackups(dir, now, policy)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 6 || countBackups(t, dir) != 4 {
		t.Fatalf("超过上限应删到 4 份: removed=%d left=%d", removed, countBackups(t, dir))
	}

	// 留的必须是最新的 4 份，不能把刚产生的删了
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(filepath.Join(dir, backupName(stamps[i]))); err != nil {
			t.Fatalf("最新的第 %d 份不该被删: %v", i+1, err)
		}
	}
}

// 目录里可能有用户自己放的文件、上一版遗留的 .tmp，清理时一律不碰。
func TestPruneIgnoresForeignFiles(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	dir := newBackupDir(t, now.AddDate(0, 0, -200))

	foreign := []string{"invoices.csv.tmp", "备份说明.txt", "invoices-坏名字.csv"}
	for _, name := range foreign {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("keep me"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := pruneBackups(dir, now, DefaultBackupPolicy(90)); err != nil {
		t.Fatal(err)
	}
	for _, name := range foreign {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatalf("不相干的文件被误删: %s", name)
		}
	}
}

func TestPruneMissingDirIsNotAnError(t *testing.T) {
	removed, err := pruneBackups(filepath.Join(t.TempDir(), "nope"), time.Now(), DefaultBackupPolicy(90))
	if err != nil || removed != 0 {
		t.Fatalf("目录不存在应安静跳过: removed=%d err=%v", removed, err)
	}
}

// MaxFiles 忘了填不能把历史备份全删了。
func TestPruneZeroMaxFilesFallsBackToLimit(t *testing.T) {
	now := time.Date(2026, 11, 19, 15, 0, 0, 0, time.Local)
	dir := newBackupDir(t, now.Add(-1*time.Hour), now.Add(-2*time.Hour), now.Add(-3*time.Hour))

	removed, err := pruneBackups(dir, now, BackupPolicy{KeepAllDays: 7, KeepDays: 90})
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 || countBackups(t, dir) != 3 {
		t.Fatalf("MaxFiles 未填时不应删任何东西: removed=%d left=%d", removed, countBackups(t, dir))
	}
}

// 保存成功后自动清理：保证策略真的接在了写入链路上，而不只是能单独调用。
func TestSavePrunesBackups(t *testing.T) {
	store := newTestLedger(t)
	store.SetBackupPolicy(BackupPolicy{KeepAllDays: 7, KeepDays: 90, MaxFiles: 2})

	for i := 0; i < 5; i++ {
		if err := store.save([]Invoice{{Number: fmt.Sprintf("N%d", i)}}); err != nil {
			t.Fatal(err)
		}
	}

	entries, err := os.ReadDir(store.backupDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) > 2 {
		t.Fatalf("备份应被压到上限之内，实际 %d 份", len(entries))
	}
}

// 真实存量场景：老版本留下的备份堆了几百份，其中不少已过保留期。
// 一次保存之后既要把超期的删掉，也要把总量压到上限内。
func TestSavePrunesLegacyBackupPile(t *testing.T) {
	store := newTestLedger(t)
	now := time.Now()

	const legacyCount = 320
	for i := 0; i < legacyCount; i++ {
		at := now.AddDate(0, 0, -i)
		// 老版本用 "-" 拼毫秒，新解析器必须照样认得出
		name := fmt.Sprintf("invoices-%s-%03d.csv", at.Format("20060102-150405"), at.Nanosecond()/1000000)
		if err := os.WriteFile(filepath.Join(store.backupDir, name), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	if err := store.save([]Invoice{{Number: "N1"}}); err != nil {
		t.Fatal(err)
	}

	left := countBackups(t, store.backupDir)
	if left > backupMaxFiles {
		t.Fatalf("备份总量应压到 %d 之内，实际 %d", backupMaxFiles, left)
	}
	if left < 1 {
		t.Fatal("不该把备份删空")
	}

	// 留下来的最旧一份不能超过保留期，且近期快照要完整
	entries, err := os.ReadDir(store.backupDir)
	if err != nil {
		t.Fatal(err)
	}
	oldest := now
	for _, entry := range entries {
		at, ok := backupTime(entry.Name())
		if !ok {
			t.Fatalf("留下来的都该是我们认得的备份: %s", entry.Name())
		}
		if at.Before(oldest) {
			oldest = at
		}
	}
	if age := now.Sub(oldest); age > 91*24*time.Hour {
		t.Fatalf("超期备份没删干净，最旧的一份已 %d 天", int(age.Hours()/24))
	}
}
