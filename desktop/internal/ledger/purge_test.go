package ledger

import "testing"

func TestPurgeByCreatedAt(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	preview, err := store.PurgeByCreatedAt("2026-11-17", "2026-11-17", true)
	if err != nil || preview != 2 {
		t.Fatalf("预览结果错误: %d %v", preview, err)
	}
	all, _ := store.All()
	if len(all) != 2 {
		t.Fatal("预览不应删除记录")
	}

	removed, err := store.PurgeByCreatedAt("2026-11-17", "2026-11-17", false)
	if err != nil || removed != 2 {
		t.Fatalf("清理结果错误: %d %v", removed, err)
	}
	all, _ = store.All()
	if len(all) != 0 {
		t.Fatalf("清理后应为空: %d", len(all))
	}
}

func TestPurgeKeepsOtherDays(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	removed, err := store.PurgeByCreatedAt("2026-11-18", "2026-11-20", false)
	if err != nil || removed != 0 {
		t.Fatalf("不应删除其他日期: %d %v", removed, err)
	}
	all, _ := store.All()
	if len(all) != 2 {
		t.Fatalf("记录应保留: %d", len(all))
	}
}
