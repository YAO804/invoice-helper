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
