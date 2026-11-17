package api

import (
	"net/http"

	"invoice-helper/desktop/internal/files"
)

const uploadOverhead = 1 << 20

func uploadFile(store *files.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := int64(files.MaxUploadBytes + uploadOverhead)
		r.Body = http.MaxBytesReader(w, r.Body, limit)

		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeError(w, http.StatusBadRequest, "multipart 解析失败: "+err.Error())
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "缺少 file 字段")
			return
		}
		defer file.Close()

		record, err := store.SaveUpload(header.Filename, file, header.Size, r.FormValue("source"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "保存失败: "+err.Error())
			return
		}

		status := http.StatusCreated
		if record.Duplicate {
			status = http.StatusOK
		}
		writeJSON(w, status, record)
	}
}
