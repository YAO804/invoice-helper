package api

import (
	"net/http"
	"testing"

	"invoice-helper/desktop/internal/ledger"
)

func TestCreateInvoiceAPI(t *testing.T) {
	handler, _ := newTestHandler(t)

	payload := map[string]any{
		"number":     "M100",
		"code":       "C100",
		"kind":       "数电票",
		"issue_date": "2026-11-18",
		"total":      "66.00",
		"reimburser": "王五",
	}
	rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, payload), "application/json")
	if rec.Code != http.StatusCreated {
		t.Fatalf("新增状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	var created struct {
		Invoice ledger.Invoice `json:"invoice"`
	}
	decodeJSON(t, rec, &created)
	if created.Invoice.Number != "M100" || created.Invoice.Batch != ledger.ManualBatch {
		t.Fatalf("新增结果错误: %+v", created.Invoice)
	}
	if created.Invoice.Duplicate {
		t.Fatal("首条不该是重复")
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.Total != 1 || list.Items[0].Total != "66.00" {
		t.Fatalf("新增未落库: %+v", list.Items)
	}
}

func TestCreateInvoiceRejectsEmptyNumber(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := request(t, handler, http.MethodPost, "/api/invoices/manual",
		jsonBody(t, map[string]any{"number": "   "}), "application/json")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("空号码应返回 400，得到 %d", rec.Code)
	}
}

func TestCreateInvoiceFlagsDuplicate(t *testing.T) {
	handler, _ := newTestHandler(t)

	first := map[string]any{"number": "M200", "code": "C200", "total": "10.00"}
	request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, first), "application/json")

	// 金额不同也应该判重复：判重只看代码+号码
	second := map[string]any{"number": "M200", "code": "C200", "total": "12.00"}
	rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, second), "application/json")
	var created struct {
		Invoice ledger.Invoice `json:"invoice"`
	}
	decodeJSON(t, rec, &created)
	if !created.Invoice.Duplicate {
		t.Fatal("同代码+号码应标记重复")
	}

	listRec := request(t, handler, http.MethodGet, "/api/invoices", nil, "")
	var list invoiceListResponse
	decodeJSON(t, listRec, &list)
	if list.DuplicateGroups != 1 {
		t.Fatalf("重复组数错误: %d", list.DuplicateGroups)
	}
}
