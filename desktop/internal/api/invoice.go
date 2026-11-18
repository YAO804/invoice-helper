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
	LatestBatch     string                  `json:"latest_batch"`
	LatestCreatedAt string                  `json:"latest_created_at"`
}

func (d *deps) listInvoices(w http.ResponseWriter, r *http.Request) {
	query := ledger.QueryFromValues(r.URL.Query())
	items, groups, meta, err := d.ledger.ListWithMeta(query)
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
		LatestBatch:     meta.LatestBatch,
		LatestCreatedAt: meta.LatestCreatedAt,
	})
}
