package api

import (
	"net/http"

	"invoice-helper/desktop/internal/ledger"
)

// numberWarning 给网页手动录入表单做实时提示。
//
// 位数规则只在 ledger.NumberWarning 里实现一份：导入预览、手动录入实时提示、
// 保存后的结果提示必须用同一句话，否则用户会看到两套矛盾的口径。
func (d *deps) numberWarning(w http.ResponseWriter, r *http.Request) {
	invoice := ledger.Invoice{
		Number: r.URL.Query().Get("number"),
		Code:   r.URL.Query().Get("code"),
	}
	writeJSON(w, http.StatusOK, map[string]any{"warning": ledger.NumberWarning(invoice)})
}
