package files

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func addRecord(t *testing.T, store *Store, id string, uploadedAt time.Time) {
	t.Helper()

	name := id + ".xml"
	path := filepath.Join(store.IncomingDir(), name)
	if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	record := Record{
		ID:         id,
		Name:       name,
		Size:       1,
		Path:       name,
		UploadedAt: uploadedAt.UTC().Format(time.RFC3339),
	}
	if err := store.appendRecord(record); err != nil {
		t.Fatal(err)
	}
}

func TestPurgeOlderThanKeepsFresh(t *testing.T) {
	store := newTestStore(t)
	addRecord(t, store, "old", time.Now().AddDate(0, 0, -40))
	addRecord(t, store, "fresh", time.Now().AddDate(0, 0, -1))

	count, err := store.CountOlderThan(30)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("预览数量错误: %d", count)
	}
	// 预览不能真删
	records, _ := store.ListRecords()
	if len(records) != 2 {
		t.Fatalf("预览不该删除记录: %d", len(records))
	}

	removed, err := store.PurgeOlderThan(30)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("删除数量错误: %d", removed)
	}

	records, _ = store.ListRecords()
	if len(records) != 1 || records[0].ID != "fresh" {
		t.Fatalf("应只保留新文件: %+v", records)
	}
	if _, err := os.Stat(filepath.Join(store.IncomingDir(), "old.xml")); err == nil {
		t.Fatal("超期文件仍然存在")
	}
	if _, err := os.Stat(filepath.Join(store.IncomingDir(), "fresh.xml")); err != nil {
		t.Fatal("新文件不应被删")
	}
}

func TestPurgeOlderThanIgnoresBrokenTime(t *testing.T) {
	store := newTestStore(t)
	if err := store.saveRecords([]Record{{ID: "bad", Name: "bad.xml", Path: "bad.xml", UploadedAt: "不是时间"}}); err != nil {
		t.Fatal(err)
	}

	removed, err := store.PurgeOlderThan(30)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("时间无法解析的记录不该自动删: %d", removed)
	}
}

func TestPurgeOlderThanZeroDaysDoesNothing(t *testing.T) {
	store := newTestStore(t)
	addRecord(t, store, "old", time.Now().AddDate(0, 0, -400))

	removed, err := store.PurgeOlderThan(0)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("0 表示不清理: %d", removed)
	}
}

func TestDeleteIncomingMany(t *testing.T) {
	store := newTestStore(t)
	addRecord(t, store, "a", time.Now())
	addRecord(t, store, "b", time.Now())
	addRecord(t, store, "c", time.Now())

	deleted, err := store.DeleteIncomingMany([]string{"a", "c", ""})
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2 {
		t.Fatalf("批量删除数量错误: %d", deleted)
	}

	records, _ := store.ListRecords()
	if len(records) != 1 || records[0].ID != "b" {
		t.Fatalf("剩余记录错误: %+v", records)
	}
}

func TestDeleteAllIncoming(t *testing.T) {
	store := newTestStore(t)
	addRecord(t, store, "a", time.Now())
	addRecord(t, store, "b", time.Now())

	deleted, err := store.DeleteAllIncoming()
	if err != nil {
		t.Fatal(err)
	}
	if deleted != 2 {
		t.Fatalf("清空数量错误: %d", deleted)
	}

	records, _ := store.ListRecords()
	if len(records) != 0 {
		t.Fatalf("清空后仍有记录: %+v", records)
	}
}
