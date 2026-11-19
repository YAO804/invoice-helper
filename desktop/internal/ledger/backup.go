package ledger

import (
	"errors"
	"os"
	"path/filepath"
	"time"
)

func (s *Store) backup() error {
	content, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	name := backupName(time.Now())
	return os.WriteFile(filepath.Join(s.backupDir, name), content, 0644)
}
