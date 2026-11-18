package api

import (
	"net/http"

	"invoice-helper/desktop/web"
)

// staticFiles 返回内嵌的前端资源。
//
// 一律 no-store：这些文件是 embed 进二进制的，改一行 JS 必须重新编译才生效；
// 如果浏览器留着旧副本，用户会看到「代码明明改了但界面没变」，
// 排查时最容易被误判成功能没做。文件总共几十 KB、只在本机局域网上跑，
// 每次都重传的代价远小于让人对着一份旧界面调试。
func staticFiles() http.Handler {
	fileServer := http.FileServer(http.FS(web.FS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")

		if r.URL.Path == "/" {
			data, err := web.FS.ReadFile("index.html")
			if err != nil {
				writeError(w, http.StatusInternalServerError, "读取首页失败: "+err.Error())
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(data)
			return
		}

		fileServer.ServeHTTP(w, r)
	})
}
