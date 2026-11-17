package ledger

import "testing"

func newTestLedger(t *testing.T) *Store {
	t.Helper()

	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func sampleInvoices() []Invoice {
	return []Invoice{
		{
			Number: "N001", Code: "", Kind: "普通发票", IssueDate: "2026-08-01",
			Total: "113.00", Reimburser: "张三",
			Batch: "B001", CreatedAt: "2026-11-17 10:00:00",
		},
		{
			Number: "N002", Code: "", Kind: "普通发票", IssueDate: "2026-08-02",
			Total: "226.00", Reimburser: "",
			Batch: "B002", CreatedAt: "2026-11-17 11:00:00",
		},
	}
}
