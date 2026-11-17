package ledger

import (
	"errors"
	"fmt"
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

	now := time.Now()
	name := fmt.Sprintf("invoices-%s-%03d.csv", now.Format("20060102-150405"), now.Nanosecond()/1000000)
	return os.WriteFile(filepath.Join(s.backupDir, name), content, 0644)
}
