package files

import (
	"os"
	"path/filepath"
)

func (s *Store) ListOutgoing() ([]OutgoingFile, error) {
	entries, err := os.ReadDir(s.outgoing)
	if err != nil {
		return nil, err
	}

	list := []OutgoingFile{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return nil, err
		}

		list = append(list, OutgoingFile{
			Name:       entry.Name(),
			Size:       info.Size(),
			ModifiedAt: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return list, nil
}

func (s *Store) OutgoingPath(name string) (string, bool) {
	if !validStoredName(name) {
		return "", false
	}

	path := filepath.Join(s.outgoing, name)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return "", false
	}
	return path, true
}
