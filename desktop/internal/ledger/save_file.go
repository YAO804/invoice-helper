package ledger

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// renameRetryWaits 是改名失败后的重试间隔。杀毒扫描、同步盘、搜索索引都会把文件
// 短暂锁住几百毫秒，一次失败就报错会让用户以为程序坏了。
var renameRetryWaits = []time.Duration{0, 80 * time.Millisecond, 160 * time.Millisecond, 320 * time.Millisecond}

// writeTempFile 在目标同目录下建临时文件再整份写入。
// 用随机名而不是固定的 .tmp，避免上一次失败的残留被这次覆盖时撞上权限问题。
func writeTempFile(path string, content []byte) (string, error) {
	file, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return "", err
	}

	name := file.Name()
	if _, err := file.Write(content); err != nil {
		file.Close()
		os.Remove(name)
		return "", err
	}
	if err := file.Close(); err != nil {
		os.Remove(name)
		return "", err
	}
	return name, nil
}

// replaceFile 把临时文件换成正式台账。
//
// Windows 上目标文件只要被别的程序打开且没共享删除权限，Rename 就返回
// "Access is denied"：用户拿 Excel 看了一眼台账、或旧窗口还没关，都会这样。
// 重试能救回杀软/索引这类短暂占用；真救不回来时给一句能照着做的中文，
// 而不是把系统的英文错误甩给用户。
func replaceFile(tmp, target string) error {
	var err error
	for _, wait := range renameRetryWaits {
		if wait > 0 {
			time.Sleep(wait)
		}
		if err = os.Rename(tmp, target); err == nil {
			return nil
		}
	}

	// 保留临时文件没有意义：内容就是本次要写的台账，重导一次即可
	os.Remove(tmp)
	return fmt.Errorf("%s 正被别的程序占用，写不进去。"+
		"常见原因是这份台账正被 Excel/WPS 打开，或上一个攒票小匣窗口还没关；关掉后重试即可", target)
}
