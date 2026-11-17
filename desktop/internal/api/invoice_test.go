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

func invoiceRow(number string, seller string, total string) []string {
	return []string{
		number, "", "普通发票", "2026-08-01", seller, "T001", "个人", "",
		"100.00", "13.00", total, "13%", "B001", "2026-11-17 10:00:00",
	}
}

func TestInvoiceListAndDuplicates(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(invoiceRow("N001", "甲公司", "113.00"), invoiceRow("N001", "乙公司", "113.00"))
	body, contentType := uploadBody(t, "invoices.csv", string(content))

	importRec := request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)
	if importRec.Code != http.StatusOK {
		t.Fatalf("导入状态码错误: %d, body=%s", importRec.Code, importRec.Body.String())
	}

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
