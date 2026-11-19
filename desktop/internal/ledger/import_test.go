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

	count, err := store.CommitImport(content, true)
	if err != nil {
		t.Fatal(err)
	}
	// 预览说「新增 1」，实际就只能写 1 张；以前重复票会被照常写入，界面数字是装饰品。
	if count.Imported != preview.NewCount {
		t.Fatalf("写入数量应等于预览的新增数: preview=%d imported=%d", preview.NewCount, count.Imported)
	}
	if count.Duplicate != 1 || count.Invalid != 1 {
		t.Fatalf("跳过数量错误: %+v", count)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[1].Batch == "" {
		t.Fatalf("导入结果错误: %+v", list)
	}
}

// 重复票不能被写进台账，否则用户还要去查重页手工清理一遍。
func TestCommitImportSkipsDuplicates(t *testing.T) {
	store := newTestLedger(t)
	existing := Invoice{Number: "12345678", Code: "033001900111", Reimburser: "老张"}
	if err := store.save([]Invoice{existing}); err != nil {
		t.Fatal(err)
	}

	content, err := writeCSV([]Invoice{
		{Number: "12345678", Code: "033001900111", Reimburser: "老张"},
		{Number: "12345678", Code: "033001900111", Reimburser: "老张"},
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.CommitImport(content, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Imported != 0 || result.Duplicate != 2 {
		t.Fatalf("全重复文件不应写入任何行: %+v", result)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("台账应保持 1 条: %+v", list)
	}
}

// 同一份文件里自己撞自己，第二张也要跳过，否则一次导入就能制造出重复组。
func TestCommitImportSkipsRepeatedRowsInSameFile(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "12345678", Code: "033001900111", Reimburser: "甲"},
		{Number: "12345678", Code: "033001900111", Reimburser: "乙"},
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.CommitImport(content, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Imported != 1 || result.Duplicate != 1 {
		t.Fatalf("文件内重复应只写第一张: %+v", result)
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
