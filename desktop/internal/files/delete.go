package files

import (
	"errors"
	"os"
)

func (s *Store) DeleteIncoming(id string) (bool, error) {
	records, err := s.loadRecords()
	if err != nil {
		return false, err
	}

	kept := []Record{}
	found := false
	var target Record
	for _, record := range records {
		if record.ID == id {
			found = true
			target = record
			continue
		}
		kept = append(kept, record)
	}
	if !found {
		return false, nil
	}

	if err := removeFile(s.IncomingRecordPath(target)); err != nil {
		return false, err
	}
	return true, s.saveRecords(kept)
}

func (s *Store) DeleteOutgoing(name string) (bool, error) {
	path, ok := s.OutgoingPath(name)
	if !ok {
		return false, nil
	}
	if err := removeFile(path); err != nil {
		return false, err
	}
	return true, nil
}

func removeFile(path string) error {
	err := os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
