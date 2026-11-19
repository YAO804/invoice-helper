package api

import (
	"fmt"
	"net/http"
	"testing"
)

// seedInvoices 直接走导入接口铺一批数据，比逐条 POST 快，也贴近真实来源。
func seedInvoices(t *testing.T, handler http.Handler, count int) {
	t.Helper()

	rows := "发票号码,发票代码,票种,开票日期,价税合计,报销人\n"
	for i := 1; i <= count; i++ {
		reimburser := ""
		if i%2 == 0 {
			reimburser = "张三"
		}
		rows += fmt.Sprintf("N%03d,C%03d,数电票,2026-11-%02d,10.00,%s\n", i, i, (i%28)+1, reimburser)
	}

	body, contentType := uploadBody(t, "台账.csv", rows)
	rec := request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1&skip_duplicates=0", body, contentType)
	if rec.Code != http.StatusOK {
		t.Fatalf("铺数据失败: %d %s", rec.Code, rec.Body.String())
	}
}

func TestListPaginatesAndReportsTotals(t *testing.T) {
	handler, _ := newTestHandler(t)
	seedInvoices(t, handler, 45)

	rec := request(t, handler, http.MethodGet, "/api/invoices?page=2&page_size=20", nil, "")
	var page2 invoiceListResponse
	decodeJSON(t, rec, &page2)

	if len(page2.Items) != 20 {
		t.Fatalf("第 2 页应有 20 条，实际 %d", len(page2.Items))
	}
	// Total 是筛选后的总条数，不是当前页条数，页脚要靠它写「共 N 张」
	if page2.Total != 45 || page2.PageCount != 3 || page2.Page != 2 {
		t.Fatalf("分页信息错误: total=%d page=%d page_count=%d", page2.Total, page2.Page, page2.PageCount)
	}
	// 待补录按筛选后的全量算：翻到哪页都该是同一个数
	if page2.NeedFill != 23 {
		t.Fatalf("待补录应按全量统计（23 张没填报销人），实际 %d", page2.NeedFill)
	}
}

func TestListWithoutPageParamReturnsEverything(t *testing.T) {
	handler, _ := newTestHandler(t)
	seedInvoices(t, handler, 45)

	rec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var all invoiceListResponse
	decodeJSON(t, rec, &all)

	// 小程序判重与导出拿的都是整份台账，默认分页会让它们静默少算
	if len(all.Items) != 45 || all.PageCount != 1 {
		t.Fatalf("不传 page 应返回全量，实际 %d 条 / %d 页", len(all.Items), all.PageCount)
	}
}

func TestListPageBeyondLastIsClamped(t *testing.T) {
	handler, _ := newTestHandler(t)
	seedInvoices(t, handler, 25)

	rec := request(t, handler, http.MethodGet, "/api/invoices?page=99&page_size=20", nil, "")
	var list invoiceListResponse
	decodeJSON(t, rec, &list)

	if list.Page != 2 || len(list.Items) != 5 {
		t.Fatalf("越界页应贴到最后一页（第 2 页 5 条），实际第 %d 页 %d 条", list.Page, len(list.Items))
	}
}

// 分页后前端只剩一页数据，建议池必须由后端按整份台账给，否则会缩水成
// 「这一页出现过的报销人」。
func TestListSuggestionsCoverWholeLedger(t *testing.T) {
	handler, _ := newTestHandler(t)
	seedInvoices(t, handler, 45)

	rec := request(t, handler, http.MethodGet, "/api/invoices?page=3&page_size=20", nil, "")
	var list invoiceListResponse
	decodeJSON(t, rec, &list)

	if len(list.Suggestions.Reimburser) != 1 {
		t.Fatalf("建议池应含全表的报销人，实际 %+v", list.Suggestions.Reimburser)
	}
	if list.Suggestions.Reimburser[0].Value != "张三" || list.Suggestions.Reimburser[0].Count != 22 {
		t.Fatalf("报销人统计错误: %+v", list.Suggestions.Reimburser[0])
	}
	if len(list.Suggestions.Kind) != 1 || list.Suggestions.Kind[0].Count != 45 {
		t.Fatalf("票种统计错误: %+v", list.Suggestions.Kind)
	}
}

// 分页必须发生在筛选之后：先筛再切页，页脚数字才是筛选结果。
func TestListPaginatesAfterFilter(t *testing.T) {
	handler, _ := newTestHandler(t)
	seedInvoices(t, handler, 45)

	rec := request(t, handler, http.MethodGet, "/api/invoices?only_need_fill=1&page=2&page_size=20", nil, "")
	var list invoiceListResponse
	decodeJSON(t, rec, &list)

	if list.Total != 23 || list.PageCount != 2 || len(list.Items) != 3 {
		t.Fatalf("筛选后应是 23 条 2 页，第 2 页 3 条；实际 total=%d 页数=%d 本页=%d",
			list.Total, list.PageCount, len(list.Items))
	}
}
