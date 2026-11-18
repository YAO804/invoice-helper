package ledger

import (
	"strings"
	"testing"
)

// only_duplicates 过滤依赖 Duplicate 标记；Export 少标一次就会导出空表。
func TestExportOnlyDuplicates(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices([]Invoice{
		{Number: "N1", Code: "C1", Total: "10.00"},
		{Number: "N1", Code: "C1", Total: "10.00"},
		{Number: "N2", Code: "C2", Total: "20.00"},
	}); err != nil {
		t.Fatal(err)
	}

	content, err := store.Export(Query{OnlyDuplicates: true})
	if err != nil {
		t.Fatal(err)
	}
	rows := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(rows) != 3 { // 表头 + 两条重复记录
		t.Fatalf("导出重复票应有 3 行，实际 %d 行:\n%s", len(rows), content)
	}
	if !strings.Contains(string(content), "N1") || strings.Contains(string(content), "N2") {
		t.Fatalf("导出内容不对:\n%s", content)
	}
}

func TestExportOnlyNeedFill(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices([]Invoice{
		{Number: "N1", Code: "C1", Reimburser: "张三"},
		{Number: "N2", Code: "C2", Reimburser: ""},
	}); err != nil {
		t.Fatal(err)
	}

	content, err := store.Export(Query{OnlyNeedFill: true})
	if err != nil {
		t.Fatal(err)
	}
	rows := strings.Split(strings.TrimSpace(string(content)), "\n")
	if len(rows) != 2 {
		t.Fatalf("导出待补录应有 2 行，实际 %d 行", len(rows))
	}
	if !strings.Contains(string(content), "N2") {
		t.Fatalf("待补录导出内容不对:\n%s", content)
	}
}
