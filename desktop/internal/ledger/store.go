package ledger

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type Store struct {
	path      string
	backupDir string
	mu        sync.Mutex
}

func New(dataDir string) (*Store, error) {
	if dataDir == "" {
		return nil, fmt.Errorf("数据目录不能为空")
	}
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	backupDir := filepath.Join(dataDir, "backup")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, err
	}
	return &Store{
		path:      filepath.Join(dataDir, FileName),
		backupDir: backupDir,
	}, nil
}

func (s *Store) Path() string {
	return s.path
}

func (s *Store) load() ([]Invoice, error) {
	content, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return []Invoice{}, nil
	}
	if err != nil {
		return nil, err
	}

	list, err := parseCSV(content)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].ID = i + 1
	}
	return list, nil
}

func (s *Store) save(list []Invoice) error {
	if err := s.backup(); err != nil {
		return err
	}

	content, err := writeCSV(list)
	if err != nil {
		return err
	}

	tmp, err := writeTempFile(s.path, content)
	if err != nil {
		return err
	}
	return replaceFile(tmp, s.path)
}

func (s *Store) All() ([]Invoice, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.load()
}
