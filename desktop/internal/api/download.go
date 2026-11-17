package api

import (
	"mime"
	"net/http"
	"os"
	"path/filepath"

	"invoice-helper/desktop/internal/files"
)

func downloadIncoming(store *files.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		record, ok, err := store.FindRecord(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "读取上传记录失败: "+err.Error())
			return
		}
		if !ok {
			writeError(w, http.StatusNotFound, "上传记录不存在")
			return
		}

		serveDownload(w, r, store.IncomingRecordPath(record), record.Name)
	}
}

func downloadOutgoing(store *files.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := r.PathValue("name")
		path, ok := store.OutgoingPath(name)
		if !ok {
			writeError(w, http.StatusNotFound, "待取文件不存在")
			return
		}

		serveDownload(w, r, path, name)
	}
}

func serveDownload(w http.ResponseWriter, r *http.Request, path string, name string) {
	file, err := os.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "文件打不开: "+err.Error())
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取文件信息失败: "+err.Error())
		return
	}

	contentType := mime.TypeByExtension(filepath.Ext(name))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
		"filename": name,
	}))

	http.ServeContent(w, r, name, info.ModTime(), file)
}
