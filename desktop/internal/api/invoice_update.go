package api

import (
	"net/http"
	"strconv"

	"invoice-helper/desktop/internal/ledger"
)

func (d *deps) updateInvoice(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "发票 ID 无效")
		return
	}

	request := ledger.Invoice{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "补录参数错误: "+err.Error())
		return
	}
	if request.Number == "" {
		writeError(w, http.StatusBadRequest, "发票号码不能为空")
		return
	}

	updated, ok, err := d.ledger.Update(id, request)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "补录失败: "+err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "没有这张发票")
		return
	}

	_ = d.registry.MarkEvent("import", "补录发票 "+request.Number, "", 0)
	writeJSON(w, http.StatusOK, map[string]any{"updated": true, "invoice": updated})
}
