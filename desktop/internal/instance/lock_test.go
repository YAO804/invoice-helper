package instance

import (
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestAcquireCreatesDataDirAndLockFile(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "data")

	lock, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Release()

	if _, err := os.Stat(filepath.Join(dir, lockFileName)); err != nil {
		t.Fatalf("锁文件应在数据目录里: %v", err)
	}
}

// 锁文件里写上 pid，出问题时用户能看出是哪个进程占着。
func TestAcquireWritesPID(t *testing.T) {
	dir := t.TempDir()
	lock, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Release()

	content, err := os.ReadFile(filepath.Join(dir, lockFileName))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(content)) != strconv.Itoa(os.Getpid()) {
		t.Fatalf("锁文件里应是当前进程号 %d，实际 %q", os.Getpid(), content)
	}
}

func TestSecondAcquireIsRejected(t *testing.T) {
	dir := t.TempDir()

	first, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Release()

	second, err := Acquire(dir)
	if !errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("第二次占用应被拒绝，实际 err=%v lock=%v", err, second)
	}
	if second != nil {
		t.Fatal("被拒绝时不该返回 Lock")
	}
}

func TestReleaseAllowsNextAcquire(t *testing.T) {
	dir := t.TempDir()

	first, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Release(); err != nil {
		t.Fatal(err)
	}

	second, err := Acquire(dir)
	if err != nil {
		t.Fatalf("释放后应能再次占用: %v", err)
	}
	defer second.Release()
}

// 上一次异常退出留下的 .lock 文件不该拦住下一次启动：占用看的是锁，
// 不是文件是否存在。
func TestLeftoverLockFileIsNotABlocker(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, lockFileName), []byte("12345"), 0644); err != nil {
		t.Fatal(err)
	}

	lock, err := Acquire(dir)
	if err != nil {
		t.Fatalf("残留锁文件不该拦住启动: %v", err)
	}
	defer lock.Release()
}

func TestDifferentDirsBothAcquire(t *testing.T) {
	first, err := Acquire(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer first.Release()

	second, err := Acquire(t.TempDir())
	if err != nil {
		t.Fatalf("不同数据目录互不影响: %v", err)
	}
	defer second.Release()
}

// Release 重复调用、对 nil 调用都要安全，否则 main 里的 defer 容易炸。
func TestReleaseIsIdempotent(t *testing.T) {
	lock, err := Acquire(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := lock.Release(); err != nil {
		t.Fatal(err)
	}
	if err := lock.Release(); err != nil {
		t.Fatalf("重复释放不该报错: %v", err)
	}

	var none *Lock
	if err := none.Release(); err != nil {
		t.Fatalf("nil 释放不该报错: %v", err)
	}
}
