package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStats(t *testing.T) {
	store := newTestStore(t)
	if _, err := store.SaveUpload("a.xml", strings.NewReader("hello"), 5, "unit"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(store.OutgoingDir(), "b.txt")
	if err := os.WriteFile(path, []byte("1234"), 0644); err != nil {
		t.Fatal(err)
	}

	stats, err := store.Stats()
	if err != nil {
		t.Fatal(err)
	}
	if stats.IncomingCount != 1 || stats.IncomingBytes != 5 {
		t.Fatalf("接收统计错误: %+v", stats)
	}
	if stats.OutgoingCount != 1 || stats.OutgoingBytes != 4 {
		t.Fatalf("待取统计错误: %+v", stats)
	}
	if stats.TodayCount != 1 || stats.TodayBytes != 5 {
		t.Fatalf("今日统计错误: %+v", stats)
	}
}
