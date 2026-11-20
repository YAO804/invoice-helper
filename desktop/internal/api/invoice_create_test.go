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

func TestCreateInvoiceRequiresAllButReimburser(t *testing.T) {
	handler, _ := newTestHandler(t)
	full := map[string]any{
		"number": "M300", "code": "C300", "kind": "数电票",
		"issue_date": "2026-11-18", "total": "66.00", "reimburser": "",
	}
	rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, full), "application/json")
	if rec.Code != http.StatusCreated {
		t.Fatalf("报销人空着也应能新增，得到 %d: %s", rec.Code, rec.Body.String())
	}

	for _, field := range []string{"number", "code", "kind", "issue_date", "total"} {
		payload := map[string]any{}
		for key, value := range full {
			payload[key] = value
		}
		delete(payload, field)
		rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, payload), "application/json")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("缺 %s 应返回 400，得到 %d", field, rec.Code)
		}
	}
}

func TestCreateInvoiceRejectsNonNumericTotal(t *testing.T) {
	handler, _ := newTestHandler(t)
	for _, total := range []string{"一百元", "100元", "1,234.00", "1e3"} {
		payload := map[string]any{
			"number": "M400", "code": "C400", "kind": "数电票",
			"issue_date": "2026-11-18", "total": total,
		}
		rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, payload), "application/json")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("金额 %q 应返回 400，得到 %d", total, rec.Code)
		}
	}
}

func TestCreateInvoiceAcceptsNumericTotal(t *testing.T) {
	handler, _ := newTestHandler(t)
	for _, total := range []string{"123", "176.99", "-88.00", " 66.5 "} {
		payload := map[string]any{
			"number": "M500", "code": "C500", "kind": "数电票",
			"issue_date": "2026-11-18", "total": total,
		}
		rec := request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, payload), "application/json")
		if rec.Code != http.StatusCreated {
			t.Errorf("金额 %q 应能新增，得到 %d: %s", total, rec.Code, rec.Body.String())
		}
	}
}

func TestCreateInvoiceFlagsDuplicate(t *testing.T) {
	handler, _ := newTestHandler(t)

	first := map[string]any{
		"number": "M200", "code": "C200", "kind": "数电票",
		"issue_date": "2026-11-18", "total": "10.00",
	}
	request(t, handler, http.MethodPost, "/api/invoices/manual", jsonBody(t, first), "application/json")

	// 金额不同也应该判重复：判重只看代码+号码
	second := map[string]any{
		"number": "M200", "code": "C200", "kind": "数电票",
		"issue_date": "2026-11-18", "total": "12.00",
	}
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
