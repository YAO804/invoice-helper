package ledger

import (
	"os"
	"testing"
)

func TestSaveAndLoad(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != 1 || list[1].ID != 2 {
		t.Fatalf("读取结果错误: %+v", list)
	}
}

func TestBackupExists(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save(sampleInvoices()); err != nil {
		t.Fatal(err)
	}
	if err := store.save(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(store.backupDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("第二次写入前应生成备份")
	}
}
