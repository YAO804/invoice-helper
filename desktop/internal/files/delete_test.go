package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeleteIncoming(t *testing.T) {
	store := newTestStore(t)
	record, err := store.SaveUpload("delete.xml", strings.NewReader("hello"), 5, "unit")
	if err != nil {
		t.Fatal(err)
	}

	ok, err := store.DeleteIncoming(record.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("文件应该存在")
	}
	if _, err := os.Stat(store.IncomingRecordPath(record)); err == nil {
		t.Fatal("文件未删除")
	}

	list, err := store.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Fatalf("索引未删除: %+v", list)
	}
}

func TestDeleteOutgoing(t *testing.T) {
	store := newTestStore(t)
	path := filepath.Join(store.OutgoingDir(), "hello.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	ok, err := store.DeleteOutgoing("hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("待取文件应该存在")
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("待取文件未删除")
	}
}
