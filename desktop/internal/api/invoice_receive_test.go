package api

import (
	"net/http"
	"testing"

	"invoice-helper/desktop/internal/ledger"
)

func TestCheckInvoices(t *testing.T) {
	handler, _ := newTestHandler(t)
	content := invoiceCSV(invoiceRow("N100", "甲公司", "113.00"))
	body, contentType := uploadBody(t, "invoices.csv", string(content))
	request(t, handler, http.MethodPost, "/api/invoices/import?confirm=1", body, contentType)

	payload := map[string]any{"numbers": []string{"N100", "N999"}}
	rec := request(t, handler, http.MethodPost, "/api/invoices/check", jsonBody(t, payload), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("查重状态码错误: %d", rec.Code)
	}

	var result struct {
		Matches map[string]ledger.Invoice `json:"matches"`
	}
	decodeJSON(t, rec, &result)
	if len(result.Matches) != 1 || result.Matches["N100"].SellerName != "甲公司" {
		t.Fatalf("查重结果错误: %+v", result.Matches)
	}
}

func TestReceiveInvoices(t *testing.T) {
	handler, _ := newTestHandler(t)
	payload := map[string]any{
		"device_id": "phone-1",
		"invoices": []map[string]any{
			{"number": "N200", "total": "105.00"},
			{
				"number": "N201", "total": "50.00", "seller_name": "乙公司",
				"seller_tax_id": "T2", "buyer_name": "个人", "amount": "44.25",
				"tax": "5.75", "tax_rate": "13%", "issue_date": "2026-08-01",
			},
		},
	}

	rec := request(t, handler, http.MethodPost, "/api/invoices", jsonBody(t, payload), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("接收状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	var result struct {
		Added int    `json:"added"`
		Batch string `json:"batch"`
	}
	decodeJSON(t, rec, &result)
	if result.Added != 2 || result.Batch == "" {
		t.Fatalf("接收结果错误: %+v", result)
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.Total != 2 || list.NeedFill != 1 {
		t.Fatalf("台账状态错误: total=%d needFill=%d", list.Total, list.NeedFill)
	}
	if list.Items[0].Batch != result.Batch || list.Items[1].Batch != result.Batch {
		t.Fatal("两张发票应属于同一批次")
	}
}
