package ledger

import "testing"

func TestDeleteByID(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	count, err := store.Delete([]int{1})
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("删除数量错误: %d", count)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Number != "N002" {
		t.Fatalf("删除结果错误: %+v", list)
	}
}
