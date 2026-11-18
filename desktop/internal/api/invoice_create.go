package api

import (
	"net/http"
	"strings"

	"invoice-helper/desktop/internal/ledger"
)

// createInvoice 网页手动录入一条发票。
// 只接受单条：批量录入走 CSV 导入，扫码结果走 POST /api/invoices，
// 三条写入链路各自单一，出错时容易定位。
func (d *deps) createInvoice(w http.ResponseWriter, r *http.Request) {
	request := ledger.Invoice{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "录入参数错误: "+err.Error())
		return
	}

	request.Number = strings.TrimSpace(request.Number)
	request.Code = strings.TrimSpace(request.Code)
	request.Kind = strings.TrimSpace(request.Kind)
	request.IssueDate = strings.TrimSpace(request.IssueDate)
	request.Total = strings.TrimSpace(request.Total)
	request.Reimburser = strings.TrimSpace(request.Reimburser)
	if request.Number == "" {
		writeError(w, http.StatusBadRequest, "发票号码不能为空")
		return
	}

	created, err := d.ledger.Create(request)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "录入失败: "+err.Error())
		return
	}
	_ = d.registry.MarkEvent("import", "手动录入发票 "+created.Number, "", 0)

	writeJSON(w, http.StatusCreated, map[string]any{"invoice": created})
}
