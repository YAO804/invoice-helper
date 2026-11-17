package files

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func (s *Store) loadRecords() ([]Record, error) {
	data, err := os.ReadFile(s.metaPath)
	if errors.Is(err, os.ErrNotExist) {
		return []Record{}, nil
	}
	if err != nil {
		return nil, err
	}

	records := []Record{}
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func (s *Store) saveRecords(records []Record) error {
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.metaPath, data, 0644)
}

func (s *Store) appendRecord(record Record) error {
	records, err := s.loadRecords()
	if err != nil {
		return err
	}
	records = append(records, record)
	return s.saveRecords(records)
}

func (s *Store) findByHash(sum string, size int64) (Record, bool, error) {
	records, err := s.loadRecords()
	if err != nil {
		return Record{}, false, err
	}

	for _, record := range records {
		if record.SHA256 == sum && record.Size == size {
			return record, true, nil
		}
	}
	return Record{}, false, nil
}

func (s *Store) ListRecords() ([]Record, error) {
	records, err := s.loadRecords()
	if err != nil {
		return nil, err
	}

	sort.Slice(records, func(i int, j int) bool {
		return records[i].UploadedAt > records[j].UploadedAt
	})
	return records, nil
}

func (s *Store) FindRecord(id string) (Record, bool, error) {
	records, err := s.loadRecords()
	if err != nil {
		return Record{}, false, err
	}

	for _, record := range records {
		if record.ID == id {
			return record, true, nil
		}
	}
	return Record{}, false, nil
}

func (s *Store) IncomingRecordPath(record Record) string {
	return filepath.Join(s.incoming, filepath.Base(record.Path))
}

func nowText() string {
	return time.Now().UTC().Format(time.RFC3339)
}
