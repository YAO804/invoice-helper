//go:build !windows

package instance

import (
	"errors"
	"os"
	"syscall"
)

// tryLock 用 flock 独占占用，失败立即返回（LOCK_NB 不排队）。
func tryLock(file *os.File) error {
	err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return errLocked
	}
	return err
}

func unlock(file *os.File) error {
	return syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
}
