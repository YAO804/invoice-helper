package api

import (
	"mime"
	"net/http"
	"os"

	"invoice-helper/desktop/internal/files"
)

// viewIncoming 在浏览器里直接显示小程序上传的文件（PDF / 图片 / 纯文本）。
//
// 不可预览的格式返回 415 而不是硬塞 application/octet-stream：
// 前端据此提示「请下载后用本机软件打开」，比让浏览器下载一个空文件清楚。
func (d *deps) viewIncoming(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	record, ok, err := d.store.FindRecord(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取上传记录失败: "+err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "上传记录不存在")
		return
	}

	contentType := files.PreviewContentType(record.Name)
	if contentType == "" {
		writeError(w, http.StatusUnsupportedMediaType, "这种格式浏览器打不开，请下载后用本机软件查看")
		return
	}

	file, err := os.Open(d.store.IncomingRecordPath(record))
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

	// nosniff 必须加：没有它浏览器可能把 text/plain 猜成别的类型
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{
		"filename": record.Name,
	}))

	// ServeContent 自带 Range 支持，PDF 阅读器按页取内容就靠它
	http.ServeContent(w, r, record.Name, info.ModTime(), file)
}
