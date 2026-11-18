package files

import (
	"path/filepath"
	"strings"
)

// 可预览类型。这里是**白名单**，不按扩展名猜：
// 预览接口是 inline 输出用户上传的文件，如果让 .html / .svg 按原类型返回，
// 就等于在局域网里开了个存储型 XSS 的口子（页面同源，能直接调 API）。
const (
	PreviewPDF   = "pdf"
	PreviewImage = "image"
	PreviewText  = "text"
)

var previewKinds = map[string]string{
	".pdf": PreviewPDF,

	".png":  PreviewImage,
	".jpg":  PreviewImage,
	".jpeg": PreviewImage,
	".gif":  PreviewImage,
	".webp": PreviewImage,
	".bmp":  PreviewImage,

	".txt":  PreviewText,
	".xml":  PreviewText,
	".json": PreviewText,
	".csv":  PreviewText,
	".log":  PreviewText,
	".md":   PreviewText,
}

// PreviewKind 返回浏览器能否直接显示，以及用哪种方式显示。
// 空串表示不支持——OFD / ZIP / Office 都落在这一类，只能下载后用本机软件打开。
func PreviewKind(name string) string {
	return previewKinds[strings.ToLower(filepath.Ext(name))]
}

// PreviewContentType 给出预览响应该用的 Content-Type。
// 文本统一按 text/plain 输出：XML 里的标签不能被当 HTML 解析，否则又是一条注入路径。
func PreviewContentType(name string) string {
	switch PreviewKind(name) {
	case PreviewPDF:
		return "application/pdf"
	case PreviewImage:
		switch strings.ToLower(filepath.Ext(name)) {
		case ".png":
			return "image/png"
		case ".jpg", ".jpeg":
			return "image/jpeg"
		case ".gif":
			return "image/gif"
		case ".webp":
			return "image/webp"
		case ".bmp":
			return "image/bmp"
		}
	case PreviewText:
		return "text/plain; charset=utf-8"
	}
	return ""
}
