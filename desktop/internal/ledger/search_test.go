package ledger

import "testing"

func TestFilterByKeywordAndAmount(t *testing.T) {
	list := sampleInvoices()
	query := Query{Keyword: "乙公司", AmountMin: "200"}
	result := filter(list, query)

	if len(result) != 1 || result[0].Number != "N002" {
		t.Fatalf("筛选错误: %+v", result)
	}
}

func TestFilterFlags(t *testing.T) {
	list := sampleInvoices()
	list[0].Duplicate = true
	list[0].NeedFill = true

	if got := filter(list, Query{OnlyDuplicates: true}); len(got) != 1 || got[0].Number != "N001" {
		t.Fatalf("仅看重复错误: %+v", got)
	}
	if got := filter(list, Query{OnlyNeedFill: true}); len(got) != 1 || got[0].Number != "N001" {
		t.Fatalf("仅看待补录错误: %+v", got)
	}
}
