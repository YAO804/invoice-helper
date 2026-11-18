package files

import (
	"os"
	"path/filepath"
)

// outgoingTimeLayout 是待取文件修改时间的对外格式，和小程序 isoText 解析一致。
const outgoingTimeLayout = "2006-01-02T15:04:05Z"

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

		list = append(list, outgoingEntry(entry.Name(), info))
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

// outgoingEntry 把目录项转成对外结构。列表和上传返回共用，避免两处格式漂移。
func outgoingEntry(name string, info os.FileInfo) OutgoingFile {
	return OutgoingFile{
		Name:       name,
		Size:       info.Size(),
		ModifiedAt: info.ModTime().UTC().Format(outgoingTimeLayout),
	}
}
