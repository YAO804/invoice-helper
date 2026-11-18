package ledger

import "testing"

func TestPreviewAndCommitImport(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save(sampleInvoices()[:1]); err != nil {
		t.Fatal(err)
	}

	incoming := append(sampleInvoices(), Invoice{Number: "", Reimburser: "空号码"})
	content, err := writeCSV(incoming)
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.NewCount != 1 || preview.DuplicateCount != 1 || preview.InvalidCount != 1 {
		t.Fatalf("预览统计错误: %+v", preview)
	}

	count, err := store.CommitImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("实际写入数量错误: %d", count)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 3 || list[1].Batch == "" {
		t.Fatalf("导入结果错误: %+v", list)
	}
}

// 老票同号码不同代码是两张不同的票，导入预览不能算重复。
func TestImportTreatsDifferentCodeAsNew(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save([]Invoice{{Number: "12345678", Code: "033001900111"}}); err != nil {
		t.Fatal(err)
	}

	content, err := writeCSV([]Invoice{{Number: "12345678", Code: "033001900222"}})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.NewCount != 1 || preview.DuplicateCount != 0 {
		t.Fatalf("同号码不同代码应视为新票: %+v", preview)
	}
}
