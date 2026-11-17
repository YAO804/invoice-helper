package api

import (
	"fmt"
	"net/http"
)

type purgeInvoicesRequest struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Confirm bool   `json:"confirm"`
}

func (d *deps) purgeInvoices(w http.ResponseWriter, r *http.Request) {
	request := purgeInvoicesRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "清理参数错误: "+err.Error())
		return
	}
	if request.From == "" && request.To == "" {
		writeError(w, http.StatusBadRequest, "请填写录入时间的起止日期")
		return
	}

	removed, err := d.ledger.PurgeByCreatedAt(request.From, request.To, !request.Confirm)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "清理失败: "+err.Error())
		return
	}
	if request.Confirm && removed > 0 {
		_ = d.registry.MarkEvent("import", fmt.Sprintf("按录入时间清理发票 %d 张", removed), "", 0)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"removed":   removed,
		"confirmed": request.Confirm,
	})
}
