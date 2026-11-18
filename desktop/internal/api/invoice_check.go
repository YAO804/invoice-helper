package api

import (
	"net/http"

	"invoice-helper/desktop/internal/ledger"
)

type checkInvoicesRequest struct {
	Invoices []ledger.InvoiceKey `json:"invoices"`
	// Numbers 是 v0.5 的旧字段，保留兼容：只给号码时按号码匹配。
	Numbers []string `json:"numbers"`
}

func (request checkInvoicesRequest) keys() []ledger.InvoiceKey {
	if len(request.Invoices) > 0 {
		return request.Invoices
	}
	keys := []ledger.InvoiceKey{}
	for _, number := range request.Numbers {
		keys = append(keys, ledger.InvoiceKey{Number: number})
	}
	return keys
}

func (d *deps) checkInvoices(w http.ResponseWriter, r *http.Request) {
	request := checkInvoicesRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "查重参数错误: "+err.Error())
		return
	}

	matches, err := d.ledger.FindByKeys(request.keys())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查重失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"matches": matches})
}
