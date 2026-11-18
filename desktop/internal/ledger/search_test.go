package ledger

import (
	"net/url"
	"testing"
)

func TestFilterByKeywordAndAmount(t *testing.T) {
	list := sampleInvoices()
	query := Query{Keyword: "张三", AmountMin: "100"}
	result := filter(list, query)

	if len(result) != 1 || result[0].Number != "N001" {
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

// 录入时间按天过滤：cards 的「最近录入」就是拿这一天当起止。
func TestFilterByCreatedDate(t *testing.T) {
	list := sampleInvoices()
	list[0].CreatedAt = "2026-11-17 10:00:00"
	list[1].CreatedAt = "2026-11-18 09:30:00"

	sameDay := filter(list, Query{CreatedFrom: "2026-11-18", CreatedTo: "2026-11-18"})
	if len(sameDay) != 1 || sameDay[0].Number != "N002" {
		t.Fatalf("同一天过滤错误: %+v", sameDay)
	}

	if got := filter(list, Query{CreatedFrom: "2026-11-18"}); len(got) != 1 || got[0].Number != "N002" {
		t.Fatalf("只要下限时错误: %+v", got)
	}
	if got := filter(list, Query{CreatedTo: "2026-11-17"}); len(got) != 1 || got[0].Number != "N001" {
		t.Fatalf("只要上限时错误: %+v", got)
	}
	if got := filter(list, Query{CreatedFrom: "2026-11-01", CreatedTo: "2026-11-30"}); len(got) != 2 {
		t.Fatalf("整月应为 2 条，实际 %d", len(got))
	}
	if got := filter(list, Query{CreatedFrom: "2026-12-01"}); len(got) != 0 {
		t.Fatalf("12 月应为空，实际 %d", len(got))
	}
}

// created_at 只有日期没有时间时也不能把这条漏掉。
func TestFilterByCreatedDateWithoutTime(t *testing.T) {
	list := sampleInvoices()
	list[0].CreatedAt = "2026-11-18"

	got := filter(list, Query{CreatedFrom: "2026-11-18", CreatedTo: "2026-11-18"})
	if len(got) != 1 || got[0].Number != "N001" {
		t.Fatalf("纯日期格式过滤错误: %+v", got)
	}
}

// 查询串里写的是 created_from/created_to，和前端 buildInvoiceParams 对齐。
func TestQueryFromValuesCreatedRange(t *testing.T) {
	values := url.Values{}
	values.Set("created_from", "2026-11-01")
	values.Set("created_to", "2026-11-18")

	query := QueryFromValues(values)
	if query.CreatedFrom != "2026-11-01" || query.CreatedTo != "2026-11-18" {
		t.Fatalf("录入时间参数解析错误: %+v", query)
	}
}

func TestLatestCreatedAt(t *testing.T) {
	if got := LatestCreatedAt(nil); got != "" {
		t.Fatalf("空列表应返回空串，实际 %q", got)
	}
	list := []Invoice{
		{CreatedAt: "2026-11-17 10:00:00"},
		{CreatedAt: "2026-11-18 09:30:00"},
		{CreatedAt: "2026-11-18 08:00:00"},
	}
	if got := LatestCreatedAt(list); got != "2026-11-18 09:30:00" {
		t.Fatalf("最新录入时间错误: %q", got)
	}
}

