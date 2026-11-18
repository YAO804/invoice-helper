package auth

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

var (
	ErrWrongPIN  = errors.New("当前 PIN 不正确")
	ErrWeakPIN   = errors.New("PIN 至少 4 位")
	ErrEmptyPIN  = errors.New("PIN 不能为空")
)

// Store 保存当前 PIN。
// config 里的 PIN 只是初始值：首次启动写进 data 目录，之后以文件为准，
// 这样小程序改过 PIN 后重启仍然生效，不必改代码。
type Store struct {
	mu   sync.RWMutex
	path string
	pin  string
}

type pinFile struct {
	PIN string `json:"pin"`
}

// New 用配置初始值打开 PIN 存储；文件已存在时忽略初始值。
func New(dataDir string, initialPIN string) (*Store, error) {
	path := filepath.Join(dataDir, "pin.json")
	s := &Store{path: path}
	if data, err := os.ReadFile(path); err == nil {
		var f pinFile
		if err := json.Unmarshal(data, &f); err != nil {
			return nil, err
		}
		s.pin = f.PIN
		if s.pin == "" {
			return nil, ErrEmptyPIN
		}
		return s, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}

	pin := initialPIN
	if pin == "" {
		pin = DefaultPIN
	}
	s.pin = pin
	if err := s.save(); err != nil {
		return nil, err
	}
	return s, nil
}

// Current 返回当前 PIN（小程序无感登录要带它）。
func (s *Store) Current() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.pin
}

// Check 判断给定 PIN 是否正确。
func (s *Store) Check(pin string) bool {
	return pin != "" && pin == s.Current()
}

// Change 校验旧 PIN 后更新。改完 PIN 后所有旧会话自动失效（验签用了新 PIN）。
func (s *Store) Change(oldPIN string, newPIN string) error {
	if !s.Check(oldPIN) {
		return ErrWrongPIN
	}
	if len(newPIN) < 4 {
		return ErrWeakPIN
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.pin = newPIN
	return s.save()
}

// save 调用方必须已持写锁。
func (s *Store) save() error {
	data, err := json.Marshal(pinFile{PIN: s.pin})
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0600)
}
