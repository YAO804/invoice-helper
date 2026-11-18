package files

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// SaveOutgoing 把电脑上的文件**复制**进待取区，等小程序来下载。
//
// 为什么是复制不是移动：源文件留在用户原来的位置，后面按保留期自动清理
// 待取副本时不会碰到用户的唯一一份。
//
// 同名文件放在这里很常见（同一个导出反复拖进来），所以按内容判重：
// 同名同内容直接返回已有条目（duplicate=true），同名不同内容另存为
// 「名字 (2).ext」而不是覆盖——覆盖会让正在下载的那一方拿到半截新内容。
func (s *Store) SaveOutgoing(name string, src io.Reader, size int64) (OutgoingFile, bool, error) {
	if size > MaxUploadBytes {
		return OutgoingFile{}, false, fmt.Errorf("文件超过 %d MB 限制", MaxUploadBytes>>20)
	}

	tmp, err := os.CreateTemp(s.outgoing, ".put-")
	if err != nil {
		return OutgoingFile{}, false, err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	n, sum, err := copyWithHash(tmp, src)
	closeErr := tmp.Close()
	if err != nil {
		return OutgoingFile{}, false, err
	}
	if closeErr != nil {
		return OutgoingFile{}, false, closeErr
	}
	if n > MaxUploadBytes {
		return OutgoingFile{}, false, fmt.Errorf("文件超过 %d MB 限制", MaxUploadBytes>>20)
	}

	if existing, ok, err := s.sameOutgoing(name, sum, n); err != nil {
		return OutgoingFile{}, false, err
	} else if ok {
		return existing, true, nil
	}

	finalName := s.freeOutgoingName(name)
	finalPath := filepath.Join(s.outgoing, finalName)
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return OutgoingFile{}, false, err
	}

	info, err := os.Stat(finalPath)
	if err != nil {
		return OutgoingFile{}, false, err
	}
	return outgoingEntry(finalName, info), false, nil
}

// sameOutgoing 判断同名文件是否已经是同一份内容。
func (s *Store) sameOutgoing(name, sum string, size int64) (OutgoingFile, bool, error) {
	path, ok := s.OutgoingPath(safeName(name))
	if !ok {
		return OutgoingFile{}, false, nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return OutgoingFile{}, false, err
	}
	// 先比大小，绝大多数"同名不同文件"到这一步就分开了，不用读全文件
	if info.Size() != size {
		return OutgoingFile{}, false, nil
	}
	existingSum, err := fileSum(path)
	if err != nil {
		return OutgoingFile{}, false, err
	}
	if existingSum != sum {
		return OutgoingFile{}, false, nil
	}
	return outgoingEntry(safeName(name), info), true, nil
}

// freeOutgoingName 找一个没被占用的名字：原来叫 a.pdf，占了就叫 a (2).pdf。
func (s *Store) freeOutgoingName(name string) string {
	base := safeName(name)
	if _, ok := s.OutgoingPath(base); !ok {
		return base
	}

	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	for i := 2; i <= 999; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", stem, i, ext)
		if _, ok := s.OutgoingPath(candidate); !ok {
			return candidate
		}
	}
	// 999 个同名文件几乎不可能出现；真到了这一步就用时间戳兜底，不覆盖已有文件
	return fmt.Sprintf("%s-%d%s", stem, os.Getpid(), ext)
}

func fileSum(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
