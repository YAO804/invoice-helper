package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"

func TestSaveUpload(t *testing.T) {
	store := newTestStore(t)

	record, err := store.SaveUpload("test.xml", strings.NewReader("hello"), 5, "unit")
	if err != nil {
		t.Fatal(err)
	}
	if record.Name != "test.xml" || record.Size != 5 || record.SHA256 != helloHash {
		t.Fatalf("记录字段错误: %+v", record)
	}

	data, err := os.ReadFile(store.IncomingRecordPath(record))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello" {
		t.Fatalf("落盘内容错误: %s", data)
	}

	list, err := store.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("期望 1 条记录，实际 %d", len(list))
	}
}

func TestSaveUploadDuplicate(t *testing.T) {
	store := newTestStore(t)

	first, err := store.SaveUpload("a.xml", strings.NewReader("hello"), 5, "unit")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.SaveUpload("b.xml", strings.NewReader("hello"), 5, "unit")
	if err != nil {
		t.Fatal(err)
	}

	if !second.Duplicate || second.ID != first.ID {
		t.Fatalf("重复文件未复用原记录: %+v", second)
	}

	list, err := store.ListRecords()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("重复文件不应新增记录，实际 %d", len(list))
	}
}

func TestListOutgoing(t *testing.T) {
	store := newTestStore(t)
	path := filepath.Join(store.OutgoingDir(), "hello.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	list, err := store.ListOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "hello.txt" || list[0].Size != 5 {
		t.Fatalf("待取文件列表错误: %+v", list)
	}
}
