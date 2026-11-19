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
		// 默认跳过重复（安全侧）；只有用户明确选择「全量导入」时前端才发 skip_duplicates=0。
		skipDuplicates := r.URL.Query().Get("skip_duplicates") != "0"
		result, err := d.ledger.CommitImport(content, skipDuplicates)
		if err != nil {
			writeError(w, http.StatusBadRequest, "导入失败: "+err.Error())
			return
		}
		action := "导入发票"
		if !skipDuplicates {
			action = "全量导入发票（含重复）"
		}
		_ = d.registry.MarkEvent("import", fmt.Sprintf("%s %d 张", action, result.Imported), "", 0)
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
