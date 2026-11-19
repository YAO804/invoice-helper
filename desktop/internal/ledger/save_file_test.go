package ledger

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// 台账文件被别的程序打开时，Windows 的 Rename 会失败。
// 这时候不能把 "Access is denied" 甩给用户：他既看不懂，也不知道该关什么。
func TestSaveReportsOccupiedFile(t *testing.T) {
	requireWindowsRenameLock(t)
	store := newTestLedger(t)
	if err := store.save([]Invoice{{Number: "N001"}}); err != nil {
		t.Fatal(err)
	}

	holder, err := os.OpenFile(store.Path(), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer holder.Close()

	err = store.save([]Invoice{{Number: "N002"}})
	if err == nil {
		t.Fatal("文件被占用时保存应当失败，不能假装成功")
	}
	if !strings.Contains(err.Error(), "正被别的程序占用") {
		t.Fatalf("错误应说清是文件被占用: %v", err)
	}
	if strings.Contains(err.Error(), "Access is denied") {
		t.Fatalf("不该把系统英文错误甩给用户: %v", err)
	}
	assertNoTempLeft(t, store)
}

// 杀软扫描、同步盘、搜索索引只会锁几百毫秒，重试能救回来，
// 不该让用户看到一次「导入失败」。
func TestSaveRetriesTransientLock(t *testing.T) {
	requireWindowsRenameLock(t)
	store := newTestLedger(t)
	if err := store.save([]Invoice{{Number: "N001"}}); err != nil {
		t.Fatal(err)
	}

	holder, err := os.OpenFile(store.Path(), os.O_RDWR, 0)
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		time.Sleep(120 * time.Millisecond)
		holder.Close()
	}()

	if err := store.save([]Invoice{{Number: "N002"}}); err != nil {
		t.Fatalf("短暂占用应重试成功: %v", err)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Number != "N002" {
		t.Fatalf("内容没写进去: %+v", list)
	}
	assertNoTempLeft(t, store)
}

// requireWindowsRenameLock 说明这个用例依赖 Windows 的文件锁语义：
// 类 Unix 系统允许改名覆盖正被打开的文件，测不出这条路径。
func requireWindowsRenameLock(t *testing.T) {
	t.Helper()
	if runtime.GOOS != "windows" {
		t.Skip("只在 Windows 上存在「打开的文件不能被改名覆盖」")
	}
}

// 失败的临时文件没有保留价值，留在 data 目录只会让用户以为台账坏了。
func assertNoTempLeft(t *testing.T, store *Store) {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(store.Path()), "*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) > 0 {
		t.Fatalf("不该留下临时文件: %v", matches)
	}
}
