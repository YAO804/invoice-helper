//go:build windows

package instance

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

// lockOffset 是上锁的字节位置。特意锁在文件末尾远处，把开头留给 pid 文本：
// 字节范围锁会连读都挡住（同一进程换个句柄也读不出来），锁第 0 字节的话
// 用户和排查工具连「是哪个进程占着」都看不到。
const lockOffset = 0x7FFFFFFF

func newOverlapped() *windows.Overlapped {
	overlapped := new(windows.Overlapped)
	overlapped.Offset = lockOffset
	return overlapped
}

// tryLock 用 LockFileEx 锁住一个字节，抢不到立即返回（FAIL_IMMEDIATELY 不排队等）。
func tryLock(file *os.File) error {
	err := windows.LockFileEx(windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0, 1, 0, newOverlapped())
	if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
		return errLocked
	}
	return err
}

func unlock(file *os.File) error {
	return windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, newOverlapped())
}
