package api

import (
	"net/http"
	"strings"

	"invoice-helper/desktop/internal/auth"
)

const sessionCookie = "ih_session"

// publicAPI 是不需要鉴权的接口。
// health 供手机连接前探活；connect-qr 只含本机地址、不含数据；
// auth/* 是「还没登录时要用到」的登录接口，其中 confirm 本身就校验 PIN。
var publicAPI = map[string]bool{
	"/api/health":          true,
	"/api/connect-qr.png":  true,
	"/api/auth/challenge":  true,
	"/api/auth/qr.png":     true,
	"/api/auth/confirm":    true,
	"/api/auth/session":    true,
	"/api/auth/logout":     true,
}

// withAuth 是所有接口的统一鉴权入口。
// 小程序用 X-PIN 头，网页用登录会话 cookie；两者任一有效即放行。
// 非 /api 路径是内嵌静态页，放行（登录遮罩由前端根据会话状态决定）。
func withAuth(d *deps, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") || publicAPI[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}
		if authorized(d, r) {
			next.ServeHTTP(w, r)
			return
		}
		writeError(w, http.StatusUnauthorized, "需要登录")
	})
}

func authorized(d *deps, r *http.Request) bool {
	pin := r.Header.Get("X-PIN")
	if d.auth.Check(pin) {
		return true
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	return auth.Verify(cookie.Value, d.auth.Current())
}

// issueSession 给网页签发会话并写入 cookie。HttpOnly 让 JS 读不到，降低泄露面。
func issueSession(d *deps, w http.ResponseWriter) {
	token := auth.Issue(d.auth.Current(), auth.SessionTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(auth.SessionTTL.Seconds()),
	})
}
