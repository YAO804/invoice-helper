package instance

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// lockFileName 放在数据目录里，和台账同进同退。
const lockFileName = ".lock"

// ErrAlreadyRunning 表示这份数据目录已经被另一个进程占着。
//
// 不加保护时两个窗口能同时读写同一份 invoices.csv：各自读到旧内容、
// 各自整份覆盖回去，后写的那个把前一个刚录的票悄悄抹掉。
var ErrAlreadyRunning = errors.New("已经有一个攒票小匣在用这份数据目录")

// errLocked 是平台层「锁被别人拿着」的信号，对外统一成 ErrAlreadyRunning。
var errLocked = errors.New("lock held by another process")

// Lock 是进程级的独占占用，进程退出（含崩溃）时由系统释放。
type Lock struct {
	file *os.File
	path string
}

// Acquire 占用数据目录。已有一个在跑时返回 ErrAlreadyRunning。
func Acquire(dataDir string) (*Lock, error) {
	if dataDir == "" {
		return nil, fmt.Errorf("数据目录不能为空")
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	path := filepath.Join(dataDir, lockFileName)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, err
	}

	if err := tryLock(file); err != nil {
		file.Close()
		if errors.Is(err, errLocked) {
			return nil, fmt.Errorf("%w（%s）。先关掉已经开着的那个窗口再启动；刚关掉的话等一两秒重试", ErrAlreadyRunning, path)
		}
		return nil, err
	}

	// 锁拿到之后再写 pid：写进去只是方便排查，读写权限在锁上，不在内容上。
	writePID(file)
	return &Lock{file: file, path: path}, nil
}

func writePID(file *os.File) {
	if err := file.Truncate(0); err != nil {
		return
	}
	_, _ = file.WriteAt([]byte(strconv.Itoa(os.Getpid())), 0)
}

// Release 释放占用。重复调用是安全的。
func (l *Lock) Release() error {
	if l == nil || l.file == nil {
		return nil
	}
	err := unlock(l.file)
	if closeErr := l.file.Close(); err == nil {
		err = closeErr
	}
	l.file = nil
	return err
}

// Path 返回锁文件路径，供启动日志展示。
func (l *Lock) Path() string {
	if l == nil {
		return ""
	}
	return l.path
}
