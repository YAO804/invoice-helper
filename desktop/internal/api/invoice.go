package api

import (
	"net/http"

	"invoice-helper/desktop/internal/ledger"
)

type invoiceListResponse struct {
	Items           []ledger.Invoice        `json:"items"`
	Duplicates      []ledger.DuplicateGroup `json:"duplicates"`
	Total           int                     `json:"total"`
	DuplicateGroups int                     `json:"duplicate_groups"`
	NeedFill        int                     `json:"need_fill"`
}

func (d *deps) listInvoices(w http.ResponseWriter, r *http.Request) {
	query := ledger.QueryFromValues(r.URL.Query())
	items, groups, err := d.ledger.List(query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取发票台账失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, invoiceListResponse{
		Items:           items,
		Duplicates:      groups,
		Total:           len(items),
		DuplicateGroups: len(groups),
		NeedFill:        ledger.CountNeedFill(items),
	})
}
