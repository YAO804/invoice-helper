package api

import (
	"net/http"

	"invoice-helper/desktop/web"
)

func staticFiles() http.Handler {
	fileServer := http.FileServer(http.FS(web.FS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
