package ledger

import "testing"

func TestDuplicateGroups(t *testing.T) {
	list := sampleInvoices()
	first := list[0]
	first.ID = 3
	first.Batch = "B999"
	list = append(list, first)

	groups := duplicateGroups(list)
	if len(groups) != 1 || groups[0].Number != "N001" || len(groups[0].Items) != 2 {
		t.Fatalf("重复组错误: %+v", groups)
	}

	marked := markDuplicates(list, groups)
	if !marked[0].Duplicate || !marked[2].Duplicate || marked[1].Duplicate {
		t.Fatalf("重复标记错误: %+v", marked)
	}
}

// 判重身份是「代码+号码」：老票号码只有 8 位，跨地区会撞号，代码不同就是两张票。
func TestDuplicateIdentityUsesCodeAndNumber(t *testing.T) {
	first := Invoice{Number: "12345678", Code: "033001900111", Total: "100.00", IssueDate: "2026-08-01"}
	other := Invoice{Number: "12345678", Code: "033001900222", Total: "100.00", IssueDate: "2026-08-01"}

	if groups := duplicateGroups([]Invoice{first, other}); len(groups) != 0 {
		t.Fatalf("不同代码的同号码不应判重: %+v", groups)
	}

	groups := duplicateGroups([]Invoice{first, first})
	if len(groups) != 1 || groups[0].Code != "033001900111" || len(groups[0].Items) != 2 {
		t.Fatalf("同代码同号码应判重: %+v", groups)
	}
}

// 金额和开票日期不参与判重：补录、格式抖动（147.0 / 147.00）不能把重复票放过去。
func TestDuplicateIgnoresAmountAndDate(t *testing.T) {
	a := Invoice{Number: "26932000001877489821", Total: "147.00", IssueDate: "2026-08-02"}
	b := Invoice{Number: "26932000001877489821", Total: "147.0", IssueDate: "2026-08-03"}

	groups := duplicateGroups([]Invoice{a, b})
	if len(groups) != 1 || len(groups[0].Items) != 2 {
		t.Fatalf("数电票同号码应判重，不受金额格式与日期影响: %+v", groups)
	}
	marked := markDuplicates([]Invoice{a, b}, groups)
	if !marked[0].Duplicate || !marked[1].Duplicate {
		t.Fatalf("两条都应标记重复: %+v", marked)
	}
}

func TestFindByKeysCodeIsStrictNumberIsLoose(t *testing.T) {
	store := newTestLedger(t)
	if err := store.save([]Invoice{{Number: "12345678", Code: "033001900111", Total: "100.00"}}); err != nil {
		t.Fatal(err)
	}

	exact, err := store.FindByKeys([]InvoiceKey{{Number: "12345678", Code: "033001900111"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(exact) != 1 {
		t.Fatalf("代码+号码一致应命中: %+v", exact)
	}

	otherCode, err := store.FindByKeys([]InvoiceKey{{Number: "12345678", Code: "033001900222"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(otherCode) != 0 {
		t.Fatalf("代码不同不应命中: %+v", otherCode)
	}

	// 没给代码（手输草稿）时退化为按号码匹配，宁可多提示
	loose, err := store.FindByKeys([]InvoiceKey{{Number: "12345678"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(loose) != 1 {
		t.Fatalf("只给号码时应按号码命中: %+v", loose)
	}
}

func TestNeedFill(t *testing.T) {
	list := sampleInvoices()
	// sampleInvoices[0] 报销人"张三"已填 → 不需补录；[1] 为空 → 待补录
	marked := markNeedFill(list)
	if marked[0].NeedFill || !marked[1].NeedFill {
		t.Fatalf("待补录标记错误: %+v", marked)
	}

	// 给空报销人补上后不再待补录
	marked[1].Reimburser = "李四"
	marked = markNeedFill(marked)
	if marked[1].NeedFill {
		t.Fatalf("报销人填写后仍标记待补录: %+v", marked[1])
	}
}
