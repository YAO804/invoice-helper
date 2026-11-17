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
			SellerName: "甲公司", SellerTaxID: "T001", BuyerName: "个人", BuyerTaxID: "",
			Amount: "100.00", Tax: "13.00", Total: "113.00", TaxRate: "13%",
			Batch: "B001", CreatedAt: "2026-11-17 10:00:00",
		},
		{
			Number: "N002", Code: "", Kind: "普通发票", IssueDate: "2026-08-02",
			SellerName: "乙公司", SellerTaxID: "T002", BuyerName: "个人", BuyerTaxID: "",
			Amount: "200.00", Tax: "26.00", Total: "226.00", TaxRate: "13%",
			Batch: "B002", CreatedAt: "2026-11-17 11:00:00",
		},
	}
}
