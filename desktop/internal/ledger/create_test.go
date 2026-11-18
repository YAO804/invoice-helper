package ledger

import "testing"

func TestCreateFillsManualBatch(t *testing.T) {
	store := newTestLedger(t)

	created, err := store.Create(Invoice{
		Number: "M001", Code: "C1", Kind: "数电票",
		IssueDate: "2026-11-18", Total: "88.00", Reimburser: "李四",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.Batch != ManualBatch {
		t.Fatalf("批次应固定为手动录入，得到 %q", created.Batch)
	}
	if created.CreatedAt == "" {
		t.Fatal("录入时间应自动补上")
	}
	if created.ID != 1 {
		t.Fatalf("首条 ID 应为 1，得到 %d", created.ID)
	}
	if created.NeedFill {
		t.Fatal("填了报销人就不该标待补录")
	}
}

func TestCreateMarksDuplicate(t *testing.T) {
	store := newTestLedger(t)
	first, err := store.Create(Invoice{Number: "M002", Code: "C2", Total: "10.00"})
	if err != nil {
		t.Fatal(err)
	}
	if first.Duplicate {
		t.Fatal("第一条不该是重复")
	}

	// 同代码+号码再录一次：金额不同也算重复，判重不看金额
	second, err := store.Create(Invoice{Number: "M002", Code: "C2", Total: "99.00"})
	if err != nil {
		t.Fatal(err)
	}
	if !second.Duplicate {
		t.Fatal("代码+号码相同应标记重复")
	}
	if !second.NeedFill {
		t.Fatal("报销人为空应标待补录")
	}

	// 同号码不同代码是老票，不算重复
	third, err := store.Create(Invoice{Number: "M002", Code: "C9"})
	if err != nil {
		t.Fatal(err)
	}
	if third.Duplicate {
		t.Fatal("同号码不同代码不应判为重复")
	}
}

func TestCreateKeepsExplicitBatch(t *testing.T) {
	store := newTestLedger(t)
	created, err := store.Create(Invoice{Number: "M003", Batch: "B手动"})
	if err != nil {
		t.Fatal(err)
	}
	if created.Batch != "B手动" {
		t.Fatalf("显式批次应保留，得到 %q", created.Batch)
	}
}
