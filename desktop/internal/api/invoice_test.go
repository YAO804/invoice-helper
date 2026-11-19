package api

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"strings"
	"testing"

	"invoice-helper/desktop/internal/ledger"
)

func invoiceCSV(rows ...[]string) []byte {
	var buf bytes.Buffer
	buf.WriteString("\ufeff")
	writer := csv.NewWriter(&buf)
	_ = writer.Write(ledger.Headers)
	for _, row := range rows {
		_ = writer.Write(row)
	}
	writer.Flush()
	return buf.Bytes()
}

func invoiceRow(number string, reimburser string, total string) []string {
	return []string{
		number, "", "普通发票", "2026-08-01", total, reimburser,
		"B001", "2026-11-17 10:00:00",
	}
}

// invoiceRowInBatch 指定批次号，用来验证「最新批次」取的是全表而不是筛选结果
func invoiceRowInBatch(number string, batch string) []string {
	return []string{
		number, "", "普通发票", "2026-08-01", "100.00", "甲公司",
		batch, "2026-11-17 10:00:00",
	}
}

// 卡片上的最新批次要能当筛选入口：筛了别的批次，它也不能跟着变。
func TestInvoiceLatestBatchIgnoresFilter(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(
		invoiceRowInBatch("N101", "B20261117-100000-000"),
		invoiceRowInBatch("N102", "B20261118-093729-174"),
	)
	body, contentType := uploadBody(t, "invoices.csv", string(content))
	if rec := request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType); rec.Code != http.StatusOK {
		t.Fatalf("导入状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	rec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var all invoiceListResponse
	decodeJSON(t, rec, &all)
	if all.LatestBatch != "B20261118-093729-174" {
		t.Fatalf("最新批次错误: %q", all.LatestBatch)
	}

	filteredRec := request(t, handler, http.MethodGet, "/api/invoices?batch=B20261117-100000-000", nil, "")
	var filtered invoiceListResponse
	decodeJSON(t, filteredRec, &filtered)
	if filtered.Total != 1 {
		t.Fatalf("按批次筛选后应剩 1 条，实际 %d", filtered.Total)
	}
	if filtered.LatestBatch != all.LatestBatch {
		t.Fatalf("筛选后最新批次被改动了: %q", filtered.LatestBatch)
	}
}

// 重复票的真实来源是两个同事各自扫了同一张票，走收票接口进来；查重页要能标出来。
func TestInvoiceListAndDuplicates(t *testing.T) {
	handler, _ := newTestHandler(t)

	receive := func(reimburser string) {
		payload := map[string]any{
			"device_id": "phone-1",
			"invoices":  []map[string]any{{"number": "N001", "total": "113.00", "reimburser": reimburser}},
		}
		rec := request(t, handler, http.MethodPost, "/api/invoices", jsonBody(t, payload), "application/json")
		if rec.Code != http.StatusOK {
			t.Fatalf("收票失败: %d, body=%s", rec.Code, rec.Body.String())
		}
	}
	receive("甲公司")
	receive("乙公司")

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)

	if list.Total != 2 || list.DuplicateGroups != 1 {
		t.Fatalf("列表统计错误: total=%d groups=%d", list.Total, list.DuplicateGroups)
	}
	if !list.Items[0].Duplicate || !list.Items[1].Duplicate {
		t.Fatal("重复发票未标记")
	}
}

// 导入不是造重复数据的途径：同一份文件导两次，第二次应全部跳过。
func TestImportSkipsAlreadyImported(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(invoiceRow("N500", "甲公司", "113.00"))

	first := importOnce(t, handler, content)
	if first.Imported != 1 || first.Duplicate != 0 {
		t.Fatalf("首次导入应写入 1 张: %+v", first)
	}

	second := importOnce(t, handler, content)
	if second.Imported != 0 || second.Duplicate != 1 {
		t.Fatalf("重复导入应全部跳过: %+v", second)
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.Total != 1 || list.DuplicateGroups != 0 {
		t.Fatalf("重复导入不应产生重复组: total=%d groups=%d", list.Total, list.DuplicateGroups)
	}
}

func importOnce(t *testing.T, handler http.Handler, content []byte) ledger.ImportResult {
	t.Helper()
	body, contentType := uploadBody(t, "invoices.csv", string(content))
	rec := request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)
	if rec.Code != http.StatusOK {
		t.Fatalf("导入状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}
	var result ledger.ImportResult
	decodeJSON(t, rec, &result)
	return result
}

func TestInvoiceImportPreviewAndCommit(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(invoiceRow("N002", "乙公司", "226.00"))
	body, contentType := uploadBody(t, "invoices.csv", string(content))

	previewRec := request(t, handler, http.MethodPost, "/api/invoices/import", body, contentType)
	var preview ledger.ImportPreview
	decodeJSON(t, previewRec, &preview)
	if preview.NewCount != 1 || preview.Total != 1 {
		t.Fatalf("预览统计错误: %+v", preview)
	}

	body2, contentType2 := uploadBody(t, "invoices.csv", string(content))
	commitRec := request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body2, contentType2)
	if commitRec.Code != http.StatusOK {
		t.Fatalf("确认导入状态码错误: %d", commitRec.Code)
	}
}

func TestInvoiceExportAndDelete(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(invoiceRow("N003", "丙公司", "56.50"))
	body, contentType := uploadBody(t, "invoices.csv", string(content))
	request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)

	exportRec := request(t, handler, http.MethodGet, "/api/invoices/export", nil, "")
	if exportRec.Code != http.StatusOK {
		t.Fatalf("导出状态码错误: %d", exportRec.Code)
	}
	if !strings.Contains(exportRec.Body.String(), "N003") {
		t.Fatal("导出内容缺少发票号码")
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)

	deleteRec := request(t, handler, http.MethodDelete, "/api/invoices",
		jsonBody(t, map[string]any{"ids": []int{list.Items[0].ID}}), "application/json")
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("删除状态码错误: %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}

	afterRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var after invoiceListResponse
	decodeJSON(t, afterRec, &after)
	if after.Total != 0 {
		t.Fatalf("删除后仍有发票: %d", after.Total)
	}
}
