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
	Page            int                     `json:"page"`
	PageSize        int                     `json:"page_size"`
	PageCount       int                     `json:"page_count"`
	Suggestions     invoiceSuggestions      `json:"suggestions"`
}

// invoiceSuggestions 是补录下拉的建议池，按整份台账统计。
//
// 不带的话，网页分页之后前端只能拿当前这一页去凑，常用报销人会缩水成
// 「这一页出现过的报销人」。
type invoiceSuggestions struct {
	Reimburser []ledger.ValueStat `json:"reimburser"`
	Kind       []ledger.ValueStat `json:"kind"`
}

func (d *deps) listInvoices(w http.ResponseWriter, r *http.Request) {
	query := ledger.QueryFromValues(r.URL.Query())
	result, err := d.ledger.ListFull(query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取发票台账失败: "+err.Error())
		return
	}

	// 分页在筛选之后切：页脚要显示的是「筛选后共 N 张」。
	paged := ledger.Paginate(result.Items, ledger.PageFromValues(r.URL.Query()))

	writeJSON(w, http.StatusOK, invoiceListResponse{
		Items: paged.Items,
		Total: paged.Total,
		// 待补录按筛选后的全量数，不能按当前页数，否则翻页时卡片数字跟着跳
		NeedFill:        ledger.CountNeedFill(result.Items),
		Duplicates:      result.Groups,
		DuplicateGroups: len(result.Groups),
		LatestBatch:     result.Meta.LatestBatch,
		LatestCreatedAt: result.Meta.LatestCreatedAt,
		Page:            paged.Number,
		PageSize:        paged.Size,
		PageCount:       paged.Count,
		Suggestions: invoiceSuggestions{
			Reimburser: ledger.FieldStats(result.All, "reimburser"),
			Kind:       ledger.FieldStats(result.All, "kind"),
		},
	})
}
