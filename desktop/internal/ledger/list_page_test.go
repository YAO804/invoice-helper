package ledger

import (
	"fmt"
	"net/url"
	"testing"
)

func invoiceRange(count int) []Invoice {
	list := make([]Invoice, 0, count)
	for i := 1; i <= count; i++ {
		list = append(list, Invoice{ID: i, Number: fmt.Sprintf("N%03d", i)})
	}
	return list
}

func idsOf(list []Invoice) []int {
	ids := make([]int, 0, len(list))
	for _, invoice := range list {
		ids = append(ids, invoice.ID)
	}
	return ids
}

func TestPageFromValuesDefaultsToWholeList(t *testing.T) {
	// 不传 page / page_size 必须是全量：小程序判重、导出都靠这一条
	if page := PageFromValues(url.Values{}); page.Size != 0 {
		t.Fatalf("不传分页参数应返回全量，实际 size=%d", page.Size)
	}
}

func TestPageFromValuesReadsParams(t *testing.T) {
	page := PageFromValues(url.Values{"page": {"3"}, "page_size": {"50"}})
	if page.Number != 3 || page.Size != 50 {
		t.Fatalf("应读出第 3 页每页 50 条，实际 %+v", page)
	}
}

func TestPageFromValuesFallsBackOnBadInput(t *testing.T) {
	cases := []url.Values{
		{"page": {"abc"}},
		{"page": {"-2"}},
		{"page_size": {"0"}},
		{"page_size": {"abc"}},
	}
	for _, values := range cases {
		page := PageFromValues(values)
		if page.Size != DefaultPageSize || page.Number != 1 {
			t.Fatalf("%v 应回落到第 1 页每页 %d，实际 %+v", values, DefaultPageSize, page)
		}
	}
}

// 手改 URL 一次要十万条，等于把分页关掉，还容易把浏览器拖死。
func TestPageFromValuesCapsPageSize(t *testing.T) {
	page := PageFromValues(url.Values{"page": {"1"}, "page_size": {"100000"}})
	if page.Size != MaxPageSize {
		t.Fatalf("每页条数应被压到 %d，实际 %d", MaxPageSize, page.Size)
	}
}

func TestPaginateSlicesAndCounts(t *testing.T) {
	items := invoiceRange(45)

	first := Paginate(items, Page{Number: 1, Size: 20})
	if len(first.Items) != 20 || first.Total != 45 || first.Count != 3 {
		t.Fatalf("第一页应是 20 条、共 45 条、3 页，实际 %d/%d/%d", len(first.Items), first.Total, first.Count)
	}
	if first.Items[0].ID != 1 {
		t.Fatalf("第一页应从第 1 条开始，实际 %d", first.Items[0].ID)
	}

	last := Paginate(items, Page{Number: 3, Size: 20})
	if len(last.Items) != 5 || last.Items[0].ID != 41 {
		t.Fatalf("最后一页应是 5 条且从 41 开始，实际 %d 条、首条 %d", len(last.Items), last.Items[0].ID)
	}
}

// 删掉最后一页的最后一条后用户还停在那页，贴到有效页比给空白好。
func TestPaginateClampsOverflowPage(t *testing.T) {
	paged := Paginate(invoiceRange(30), Page{Number: 9, Size: 20})
	if paged.Number != 2 {
		t.Fatalf("越界页码应贴到最后一页，实际 %d", paged.Number)
	}
	if len(paged.Items) != 10 {
		t.Fatalf("应返回最后一页的 10 条，实际 %d", len(paged.Items))
	}
}

func TestPaginateEmptyList(t *testing.T) {
	paged := Paginate(nil, Page{Number: 1, Size: 20})
	if paged.Total != 0 || paged.Count != 1 || len(paged.Items) != 0 {
		t.Fatalf("空台账应是 0 条 1 页，实际 %+v", paged)
	}
}

func TestPaginateWholeListKeepsEverything(t *testing.T) {
	paged := Paginate(invoiceRange(45), Page{})
	if len(paged.Items) != 45 || paged.Count != 1 || paged.Total != 45 {
		t.Fatalf("不分页时应原样返回整份，实际 %d 条/%d 页", len(paged.Items), paged.Count)
	}
}

func TestFieldStatsCountsAndOrders(t *testing.T) {
	list := []Invoice{
		{Reimburser: "张三", CreatedAt: "2026-11-18 09:00:00"},
		{Reimburser: "张三", CreatedAt: "2026-11-19 09:00:00"},
		{Reimburser: "李四", CreatedAt: "2026-11-10 09:00:00"},
		{Reimburser: "  ", CreatedAt: "2026-11-19 10:00:00"},
	}

	stats := FieldStats(list, "reimburser")
	if len(stats) != 2 {
		t.Fatalf("空白值不该进建议池，实际 %d 项", len(stats))
	}
	if stats[0].Value != "张三" || stats[0].Count != 2 {
		t.Fatalf("出现次数多的应排前面，实际 %+v", stats[0])
	}
	if stats[0].LastAt != "2026-11-19 09:00:00" {
		t.Fatalf("应记住最近一次录入时间，实际 %s", stats[0].LastAt)
	}
	if stats[1].Value != "李四" {
		t.Fatalf("第二项应是李四，实际 %+v", stats[1])
	}
}
