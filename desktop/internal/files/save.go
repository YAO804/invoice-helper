package files

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

func (s *Store) SaveUpload(name string, src io.Reader, size int64, source string) (Record, error) {
	if size > MaxUploadBytes {
		return Record{}, fmt.Errorf("文件超过 %d MB 限制", MaxUploadBytes>>20)
	}

	tmp, err := os.CreateTemp(s.incoming, ".upload-")
	if err != nil {
		return Record{}, err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	n, sum, err := copyWithHash(tmp, src)
	closeErr := tmp.Close()
	if err != nil {
		return Record{}, err
	}
	if closeErr != nil {
		return Record{}, closeErr
	}
	if n > MaxUploadBytes {
		return Record{}, fmt.Errorf("文件超过 %d MB 限制", MaxUploadBytes>>20)
	}

	old, ok, err := s.findByHash(sum, n)
	if err != nil {
		return Record{}, err
	}
	if ok {
		old.Duplicate = true
		return old, nil
	}

	record := newRecord(name, n, sum, source)
	finalPath := filepath.Join(s.incoming, record.ID+"_"+safeName(record.Name))
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return Record{}, err
	}

	record.Path = filepath.ToSlash(filepath.Join(IncomingDirName, filepath.Base(finalPath)))
	if err := s.appendRecord(record); err != nil {
		_ = os.Remove(finalPath)
		return Record{}, err
	}
	return record, nil
}

func copyWithHash(dst io.Writer, src io.Reader) (int64, string, error) {
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(dst, hash), io.LimitReader(src, MaxUploadBytes+1))
	return n, hex.EncodeToString(hash.Sum(nil)), err
}

func newRecord(name string, size int64, sum string, source string) Record {
	if source == "" {
		source = "web"
	}

	prefix := sum
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}

	return Record{
		ID:         time.Now().UTC().Format("20060102150405") + "-" + prefix,
		Name:       safeName(name),
		Size:       size,
		SHA256:     sum,
		Source:     source,
		UploadedAt: nowText(),
	}
}
