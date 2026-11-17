package api

import (
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"invoice-helper/desktop/internal/ledger"
)

func (d *deps) exportInvoices(w http.ResponseWriter, r *http.Request) {
	ids := parseIDs(r.URL.Query().Get("ids"))

	var content []byte
	var err error
	if len(ids) > 0 {
		content, err = d.ledger.ExportIDs(ids)
	} else {
		content, err = d.ledger.Export(ledger.QueryFromValues(r.URL.Query()))
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "导出失败: "+err.Error())
		return
	}

	name := "发票台账-" + time.Now().Format("20060102") + ".csv"
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
		"filename": name,
	}))
	_, _ = w.Write(content)
}

func parseIDs(text string) []int {
	result := []int{}
	for _, part := range strings.Split(text, ",") {
		id, err := strconv.Atoi(strings.TrimSpace(part))
		if err == nil && id > 0 {
			result = append(result, id)
		}
	}
	return result
}
