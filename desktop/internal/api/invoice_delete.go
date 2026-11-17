package api

import (
	"fmt"
	"net/http"
)

type deleteInvoicesRequest struct {
	IDs []int `json:"ids"`
}

func (d *deps) deleteInvoices(w http.ResponseWriter, r *http.Request) {
	request := deleteInvoicesRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "删除参数错误: "+err.Error())
		return
	}
	if len(request.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "请先选择要删除的发票")
		return
	}

	count, err := d.ledger.Delete(request.IDs)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "删除失败: "+err.Error())
		return
	}
	_ = d.registry.MarkEvent("delete", fmt.Sprintf("删除发票 %d 张", count), "", 0)

	writeJSON(w, http.StatusOK, map[string]any{"deleted": count})
}
