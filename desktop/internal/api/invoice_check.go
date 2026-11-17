package api

import "net/http"

type checkInvoicesRequest struct {
	Numbers []string `json:"numbers"`
}

func (d *deps) checkInvoices(w http.ResponseWriter, r *http.Request) {
	request := checkInvoicesRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "查重参数错误: "+err.Error())
		return
	}

	matches, err := d.ledger.FindByNumbers(request.Numbers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "查重失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"matches": matches})
}
