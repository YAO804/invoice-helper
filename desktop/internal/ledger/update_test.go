package ledger

import "testing"

func TestUpdateInvoice(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	input := sampleInvoices()[0]
	input.Reimburser = "王五补录"
	updated, ok, err := store.Update(1, input)
	if err != nil || !ok || updated.Reimburser != "王五补录" {
		t.Fatalf("补录结果错误: %+v ok=%v err=%v", updated, ok, err)
	}

	all, err := store.All()
	if err != nil || len(all) != 2 {
		t.Fatalf("读取台账错误: %d %v", len(all), err)
	}
	if all[0].Reimburser != "王五补录" || all[0].Batch != "B001" || all[0].CreatedAt == "" {
		t.Fatalf("补录未正确保留批次与时间: %+v", all[0])
	}
}

func TestUpdateMissingInvoice(t *testing.T) {
	store := newTestLedger(t)
	_, ok, err := store.Update(99, sampleInvoices()[0])
	if err != nil || ok {
		t.Fatalf("不存在的发票应返回未找到: ok=%v err=%v", ok, err)
	}
}
