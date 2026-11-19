package ledger

import (
	"strings"
	"testing"
)

func TestNumberWarningAcceptsRealShapes(t *testing.T) {
	cases := []Invoice{
		{Number: "00813251", Code: "032002300911"},  // 8 位号码 + 12 位代码
		{Number: "00813251", Code: "0320023009"},    // 8 位号码 + 10 位代码
		{Number: "24312000000123456789", Code: ""},  // 数电票：20 位号码、无代码
		{Number: "00813251", Code: ""},              // 代码留空不猜
		{Number: "00813251", Code: "ABC-123"},       // 非数字代码不猜
		{Number: "E20261119", Code: "032002300911"}, // 非数字号码不猜
		{Number: "", Code: "032002300911"},          // 空号码由「缺号码」负责
	}
	for _, invoice := range cases {
		if got := numberFieldWarning(invoice); got != "" {
			t.Errorf("不该误报 %+v: %s", invoice, got)
		}
	}
}

// 这正是被模板误导后填出来的样子：12 位数字进了号码列、8 位数字进了代码列。
func TestNumberWarningFlagsSwappedColumns(t *testing.T) {
	warning := numberFieldWarning(Invoice{Number: "032002300911", Code: "00813251"})
	if warning == "" {
		t.Fatal("两列填反必须提示")
	}
	for _, want := range []string{"两列可能填反了", "查重会失效"} {
		if !strings.Contains(warning, want) {
			t.Fatalf("提示应说明「%s」，实际 %q", want, warning)
		}
	}
}

func TestNumberWarningFlagsCodeInNumberColumn(t *testing.T) {
	for _, number := range []string{"032002300911", "0320023009"} {
		warning := numberFieldWarning(Invoice{Number: number, Code: ""})
		if warning == "" || !strings.Contains(warning, "更像发票代码") {
			t.Fatalf("号码列填了 %s 应提示: %q", number, warning)
		}
	}
}

func TestNumberWarningFlagsOddLengths(t *testing.T) {
	cases := []struct {
		invoice Invoice
		want    string
	}{
		{Invoice{Number: "1234567", Code: "032002300911"}, "不像常见的 8 位"},
		{Invoice{Number: "00813251", Code: "1234567"}, "不像常见的 10 或 12 位"},
	}
	for _, tc := range cases {
		warning := numberFieldWarning(tc.invoice)
		if !strings.Contains(warning, tc.want) {
			t.Fatalf("%+v 应提示「%s」，实际 %q", tc.invoice, tc.want, warning)
		}
	}
}

// 提示不能改变导入结果：位数可疑的票仍要按用户的选择写入，
// 只是把风险摆出来。自动丢掉或自动换列都比写错更糟。
func TestPreviewCountsNumberWarningsWithoutBlocking(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "00813251", Code: "032002300911", IssueDate: "2024-10-28"},
		{Number: "032002300911", Code: "00813251", IssueDate: "05-06-24"}, // 填反 + 日期待核对
		{Number: "1234567", Code: "032002300911"},                         // 位数异常
		{Number: "", Code: "032002300911"},                                // 缺号码不算位数警告
	})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.NumberWarningCount != 2 {
		t.Fatalf("应有 2 行位数可疑，实际 %d", preview.NumberWarningCount)
	}
	if preview.NewCount != 3 || preview.InvalidCount != 1 {
		t.Fatalf("提示不该改变新增/缺号码计数: %+v", preview)
	}
	if preview.Items[1].Status != "new" || preview.Items[1].NumberWarning == "" {
		t.Fatalf("填反的那行仍应是新增且带提示: %+v", preview.Items[1])
	}
	if preview.Items[1].Warning == "" {
		t.Fatal("日期警告与位数警告应能同时存在")
	}
	if preview.DateWarningCount != 1 {
		t.Fatalf("日期警告仍应单独计数，实际 %d", preview.DateWarningCount)
	}
	if preview.Items[3].NumberWarning != "" {
		t.Fatal("缺号码行不该再叠一条位数提示")
	}
}

// 提交结果也要报同一个数：预览被跳过或没留意时，导入完还得再提醒一次。
func TestCommitReportsNumberWarningCount(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "00813251", Code: "032002300911"},
		{Number: "032002300911", Code: "00813251"},
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.CommitImport(content, true)
	if err != nil {
		t.Fatal(err)
	}
	if result.NumberWarningCount != 1 {
		t.Fatalf("提交结果应报 1 行位数可疑，实际 %d", result.NumberWarningCount)
	}
	if result.Imported != 2 {
		t.Fatalf("提示不该拦下导入，应写入 2 张，实际 %d", result.Imported)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[1].Number != "032002300911" {
		t.Fatalf("填反的那张应原样入库，由用户自己核对/删除: %+v", list)
	}
}
