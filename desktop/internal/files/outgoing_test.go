package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func saveOutgoing(t *testing.T, store *Store, name string, content string) (OutgoingFile, bool) {
	t.Helper()

	entry, duplicate, err := store.SaveOutgoing(name, strings.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("SaveOutgoing(%q) 出错: %v", name, err)
	}
	return entry, duplicate
}

func TestSaveOutgoingWritesFile(t *testing.T) {
	store := newTestStore(t)

	entry, duplicate := saveOutgoing(t, store, "a.pdf", "hello")
	if duplicate {
		t.Fatal("首次放入不该是重复")
	}
	if entry.Name != "a.pdf" {
		t.Fatalf("文件名 = %q, 期望 a.pdf", entry.Name)
	}
	if entry.Size != 5 {
		t.Fatalf("大小 = %d, 期望 5", entry.Size)
	}
	if entry.ModifiedAt == "" {
		t.Fatal("修改时间不该为空")
	}

	raw, err := os.ReadFile(filepath.Join(store.OutgoingDir(), "a.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "hello" {
		t.Fatalf("落盘内容 = %q, 期望 hello", raw)
	}
}

func TestSaveOutgoingSameContentIsDuplicate(t *testing.T) {
	store := newTestStore(t)

	first, _ := saveOutgoing(t, store, "a.pdf", "hello")
	second, duplicate := saveOutgoing(t, store, "a.pdf", "hello")

	if !duplicate {
		t.Fatal("同名同内容应判为重复")
	}
	if second.Name != first.Name {
		t.Fatalf("重复时应返回已有条目 %q，实际 %q", first.Name, second.Name)
	}

	list, err := store.ListOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("重复上传不该多出文件，实际 %d 个", len(list))
	}
}

func TestSaveOutgoingSameNameDifferentContentRenames(t *testing.T) {
	store := newTestStore(t)

	saveOutgoing(t, store, "a.pdf", "first")
	second, duplicate := saveOutgoing(t, store, "a.pdf", "second")

	if duplicate {
		t.Fatal("同名但内容不同不该判为重复")
	}
	if second.Name != "a (2).pdf" {
		t.Fatalf("应改名保存，实际 %q", second.Name)
	}

	// 原文件不能被覆盖——用户可能正拿着它在下载
	raw, err := os.ReadFile(filepath.Join(store.OutgoingDir(), "a.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "first" {
		t.Fatalf("原文件被改写为 %q", raw)
	}
}

func TestSaveOutgoingSanitizesName(t *testing.T) {
	store := newTestStore(t)

	entry, _ := saveOutgoing(t, store, "../../etc/passwd", "x")
	if strings.ContainsAny(entry.Name, `/\`) {
		t.Fatalf("文件名未净化: %q", entry.Name)
	}

	if _, err := os.Stat(filepath.Join(store.OutgoingDir(), entry.Name)); err != nil {
		t.Fatalf("文件没落在待取目录: %v", err)
	}
}

func TestDeleteOutgoingMany(t *testing.T) {
	store := newTestStore(t)
	saveOutgoing(t, store, "a.pdf", "a")
	saveOutgoing(t, store, "b.pdf", "b")
	saveOutgoing(t, store, "c.pdf", "c")

	removed, err := store.DeleteOutgoingMany([]string{"a.pdf", "", "b.pdf", "missing.pdf"})
	if err != nil {
		t.Fatal(err)
	}
	if removed != 2 {
		t.Fatalf("删除数 = %d, 期望 2", removed)
	}

	list, err := store.ListOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "c.pdf" {
		t.Fatalf("剩余文件 = %+v, 期望只剩 c.pdf", list)
	}
}

func TestDeleteAllOutgoing(t *testing.T) {
	store := newTestStore(t)
	saveOutgoing(t, store, "a.pdf", "a")
	saveOutgoing(t, store, "b.pdf", "b")

	removed, err := store.DeleteAllOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if removed != 2 {
		t.Fatalf("清空数 = %d, 期望 2", removed)
	}

	list, err := store.ListOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 0 {
		t.Fatalf("清空后仍有 %d 个文件", len(list))
	}
}

func TestPurgeOutgoingOlderThan(t *testing.T) {
	store := newTestStore(t)
	saveOutgoing(t, store, "old.pdf", "old")
	saveOutgoing(t, store, "new.pdf", "new")

	// 待取区按文件修改时间判断，这里直接把旧文件的时间戳改到 40 天前
	old := time.Now().AddDate(0, 0, -40)
	if err := os.Chtimes(filepath.Join(store.OutgoingDir(), "old.pdf"), old, old); err != nil {
		t.Fatal(err)
	}

	count, err := store.CountOutgoingOlderThan(30)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("预览数量 = %d, 期望 1", count)
	}

	removed, err := store.PurgeOutgoingOlderThan(30)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 1 {
		t.Fatalf("清理数 = %d, 期望 1", removed)
	}

	list, err := store.ListOutgoing()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Name != "new.pdf" {
		t.Fatalf("清理后剩余 = %+v, 期望只剩 new.pdf", list)
	}
}

func TestPurgeOutgoingDisabled(t *testing.T) {
	store := newTestStore(t)
	saveOutgoing(t, store, "old.pdf", "old")

	old := time.Now().AddDate(0, 0, -400)
	if err := os.Chtimes(filepath.Join(store.OutgoingDir(), "old.pdf"), old, old); err != nil {
		t.Fatal(err)
	}

	removed, err := store.PurgeOutgoingOlderThan(0)
	if err != nil {
		t.Fatal(err)
	}
	if removed != 0 {
		t.Fatalf("保留期为 0 时不该删，实际删了 %d 个", removed)
	}
}
