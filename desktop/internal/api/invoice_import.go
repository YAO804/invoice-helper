package api

import (
	"fmt"
	"io"
	"net/http"
)

const importMaxBytes = 20 << 20

func (d *deps) importInvoices(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, importMaxBytes+uploadOverhead)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "表单解析失败: "+err.Error())
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "缺少 file 字段")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(io.LimitReader(file, importMaxBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "读取文件失败: "+err.Error())
		return
	}

	if r.URL.Query().Get("confirm") == "1" {
		result, err := d.ledger.CommitImport(content)
		if err != nil {
			writeError(w, http.StatusBadRequest, "导入失败: "+err.Error())
			return
		}
		_ = d.registry.MarkEvent("import", fmt.Sprintf("导入发票 %d 张", result.Imported), "", 0)
		writeJSON(w, http.StatusOK, result)
		return
	}

	preview, err := d.ledger.PreviewImport(content)
	if err != nil {
		writeError(w, http.StatusBadRequest, "解析导入文件失败: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, preview)
}
