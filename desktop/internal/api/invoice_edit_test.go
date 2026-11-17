package api

import (
	"net/http"
	"testing"
)

func TestUpdateInvoiceAPI(t *testing.T) {
	handler, _ := newTestHandler(t)
	body, contentType := uploadBody(t, "invoices.csv", string(invoiceCSV(invoiceRow("N300", "甲公司", "113.00"))))
	request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)

	payload := map[string]any{
		"number":        "N300",
		"seller_name":   "甲公司已补录",
		"seller_tax_id": "T999",
		"buyer_name":    "个人",
		"amount":        "100.00",
		"tax":           "13.00",
		"total":         "113.00",
		"tax_rate":      "13%",
	}
	rec := request(t, handler, http.MethodPut, "/api/invoices/1", jsonBody(t, payload), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("补录状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.Total != 1 || list.Items[0].SellerName != "甲公司已补录" || list.NeedFill != 0 {
		t.Fatalf("补录未生效: %+v", list)
	}
}

func TestPurgeInvoicesAPI(t *testing.T) {
	handler, _ := newTestHandler(t)
	body, contentType := uploadBody(t, "invoices.csv", string(invoiceCSV(invoiceRow("N400", "甲公司", "113.00"))))
	request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)

	preview := map[string]any{"from": "2026-11-17", "to": "2026-11-17"}
	rec := request(t, handler, http.MethodPost, "/api/invoices/purge", jsonBody(t, preview), "application/json")
	var result struct {
		Removed int `json:"removed"`
	}
	decodeJSON(t, rec, &result)
	if result.Removed != 1 {
		t.Fatalf("预览数量错误: %d", result.Removed)
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.Total != 1 {
		t.Fatal("预览不应删除记录")
	}

	confirm := map[string]any{"from": "2026-11-17", "to": "2026-11-17", "confirm": true}
	rec = request(t, handler, http.MethodPost, "/api/invoices/purge", jsonBody(t, confirm), "application/json")
	decodeJSON(t, rec, &result)
	if result.Removed != 1 {
		t.Fatalf("确认清理数量错误: %d", result.Removed)
	}

	listRec = request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	decodeJSON(t, listRec, &list)
	if list.Total != 0 {
		t.Fatalf("清理后应为空: %d", list.Total)
	}
}
