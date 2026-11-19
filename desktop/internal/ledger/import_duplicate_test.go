package ledger

import "testing"

// 只报「重复」不报「跟谁重复」，用户没法判断该不该跳，所以预览必须带上对手。
func TestPreviewReportsLedgerConflict(t *testing.T) {
	store := newTestLedger(t)
	original := Invoice{Number: "12345678", Code: "033001900111", Reimburser: "老张", Total: "113.00"}
	if err := store.save([]Invoice{original}); err != nil {
		t.Fatal(err)
	}

	content, err := writeCSV([]Invoice{
		{Number: "12345678", Code: "033001900111", Reimburser: "老李", Total: "113.00"},
	})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.DuplicateCount != 1 {
		t.Fatalf("应判为重复: %+v", preview)
	}

	item := preview.Items[0]
	if item.ConflictFrom != "ledger" {
		t.Fatalf("冲突来源应为台账: %+v", item)
	}
	if item.Conflict == nil || item.Conflict.Reimburser != "老张" || item.Conflict.ID != 1 {
		t.Fatalf("冲突对象应是台账里那张: %+v", item.Conflict)
	}
}

// 同一份文件里自己撞自己，用户看到「与本文件前面的行重复」才知道是自己表里重复了。
func TestPreviewReportsWithinFileConflict(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "12345678", Code: "033001900111", Reimburser: "甲"},
		{Number: "12345678", Code: "033001900111", Reimburser: "乙"},
	})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.NewCount != 1 || preview.DuplicateCount != 1 {
		t.Fatalf("首条新增、次条重复: %+v", preview)
	}
	if preview.Items[1].ConflictFrom != "file" {
		t.Fatalf("冲突来源应为本文件: %+v", preview.Items[1])
	}
	if preview.Items[1].Conflict == nil || preview.Items[1].Conflict.Reimburser != "甲" {
		t.Fatalf("冲突对象应是文件里前面的那条: %+v", preview.Items[1].Conflict)
	}
}

// 用户明确选择「全部导入」时不能替他跳过，否则等于否定了他的选择。
func TestCommitImportWritesDuplicatesWhenUserRefusesSkip(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "12345678", Code: "033001900111", Reimburser: "甲"},
		{Number: "12345678", Code: "033001900111", Reimburser: "乙"},
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.CommitImport(content, false)
	if err != nil {
		t.Fatal(err)
	}
	if result.Imported != 2 || result.Duplicate != 1 || result.Skipped != 0 {
		t.Fatalf("拒绝跳过就应全量写入: %+v", result)
	}
	if result.SkipDuplicates {
		t.Fatal("口径应记为全量导入")
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("台账应有 2 条（含重复）: %+v", list)
	}
}

// 跳过口径下，Skipped 要等于真正没写进去的行数（重复+缺号码），界面文案直接用它。
func TestCommitImportSkipCountsMatchResult(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save([]Invoice{{Number: "N001", Code: "C1"}}); err != nil {
		t.Fatal(err)
	}

	content, err := writeCSV([]Invoice{
		{Number: "N001", Code: "C1"},
		{Number: "N002", Code: "C2"},
		{Number: "", Code: "C3"},
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.CommitImport(content, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.Imported != 1 || result.Duplicate != 1 || result.Invalid != 1 {
		t.Fatalf("计数错误: %+v", result)
	}
	if result.Skipped != 2 {
		t.Fatalf("跳过数应为 2（1 重复 + 1 缺号码）: %+v", result)
	}
	if !result.SkipDuplicates {
		t.Fatal("口径应记为跳过重复")
	}
}
