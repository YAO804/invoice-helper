package api

import (
	"fmt"
	"net/http"

	"invoice-helper/desktop/internal/ledger"
)

const receiveMaxInvoices = 200

type receiveInvoicesRequest struct {
	Invoices []ledger.Invoice `json:"invoices"`
	DeviceID string           `json:"device_id"`
}

func (d *deps) receiveInvoices(w http.ResponseWriter, r *http.Request) {
	request := receiveInvoicesRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "接收参数错误: "+err.Error())
		return
	}
	if len(request.Invoices) == 0 {
		writeError(w, http.StatusBadRequest, "没有可接收的发票")
		return
	}
	if len(request.Invoices) > receiveMaxInvoices {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("一次最多接收 %d 张", receiveMaxInvoices))
		return
	}

	count, batch, err := d.ledger.AddInvoices(request.Invoices)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "写入台账失败: "+err.Error())
		return
	}
	_ = d.registry.MarkEvent("import", fmt.Sprintf("小程序发送发票 %d 张", count), request.DeviceID, 0)

	writeJSON(w, http.StatusOK, map[string]any{
		"added": count,
		"batch": batch,
	})
}
