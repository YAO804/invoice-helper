package files

import (
	"fmt"
	"os"
	"path/filepath"
)

const (
	IncomingDirName = "incoming"
	OutgoingDirName = "outgoing"
	MetaFileName    = "index.json"
	MaxUploadBytes  = 20 << 20
)

type Store struct {
	root     string
	incoming string
	outgoing string
	metaPath string
}

func New(root string) (*Store, error) {
	if root == "" {
		return nil, fmt.Errorf("数据目录不能为空")
	}

	incoming := filepath.Join(root, IncomingDirName)
	outgoing := filepath.Join(root, OutgoingDirName)
	if err := os.MkdirAll(incoming, 0755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(outgoing, 0755); err != nil {
		return nil, err
	}

	return &Store{
		root:     root,
		incoming: incoming,
		outgoing: outgoing,
		metaPath: filepath.Join(root, MetaFileName),
	}, nil
}

func (s *Store) IncomingDir() string {
	return s.incoming
}

func (s *Store) OutgoingDir() string {
	return s.outgoing
}

func (s *Store) Root() string {
	return s.root
}
