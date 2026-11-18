package api

import (
	"net/http"
	"net/url"

	qrcode "github.com/skip2/go-qrcode"

	"invoice-helper/desktop/internal/auth"
)

// loginScheme 是合并后的扫码串：既带本机地址，又带网页登录的一次性挑战码。
// 小程序扫一次就完成「连地址 + 授权网页登录」，不必扫两个码。
const loginScheme = "invoice-helper://login"

// LoginCode 生成合并扫码串，供二维码和小程序解析共用。
func LoginCode(base string, challenge string) string {
	if base == "" || challenge == "" {
		return ""
	}
	q := url.Values{}
	q.Set("base", base)
	q.Set("c", challenge)
	return loginScheme + "?" + q.Encode()
}

// authChallenge 给网页发一个一次性登录码。
func (d *deps) authChallenge(w http.ResponseWriter, r *http.Request) {
	code := d.challenges.Create()
	if code == "" {
		writeError(w, http.StatusInternalServerError, "生成登录码失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"code": code})
}

// authQR 输出合并二维码 PNG：内容 = 地址 + 一次性登录码。
func (d *deps) authQR(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("c")
	if code == "" {
		writeError(w, http.StatusBadRequest, "缺少登录码")
		return
	}
	loginCode := LoginCode(d.primaryBaseURL(), code)
	if loginCode == "" {
		writeError(w, http.StatusServiceUnavailable, "未检测到局域网地址，请先连上 WiFi 或网线")
		return
	}
	png, err := qrcode.Encode(loginCode, qrcode.Medium, 320)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "生成二维码失败: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(png)
}

// authConfirm 由小程序调用：带 PIN 确认登录码。PIN 正确就把码标记为已确认。
func (d *deps) authConfirm(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
		PIN  string `json:"pin"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if !d.auth.Check(body.PIN) {
		writeError(w, http.StatusUnauthorized, "PIN 不正确")
		return
	}
	if !d.challenges.Confirm(body.Code) {
		writeError(w, http.StatusGone, "登录码无效或已过期，请刷新网页重试")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// authSession 网页轮询：登录码被小程序确认后，签发会话并写 cookie。
func (d *deps) authSession(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("c")
	if code == "" || !d.challenges.Consume(code) {
		writeError(w, http.StatusUnauthorized, "等待小程序扫码确认")
		return
	}
	issueSession(d, w)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// authLogout 清除网页会话 cookie。
func (d *deps) authLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", HttpOnly: true,
		SameSite: http.SameSiteLaxMode, MaxAge: -1,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// authChangePIN 改 PIN：必须带当前 PIN（X-PIN 头或会话），改完旧会话全部失效。
func (d *deps) authChangePIN(w http.ResponseWriter, r *http.Request) {
	var body struct {
		OldPIN string `json:"old_pin"`
		NewPIN string `json:"new_pin"`
	}
	if err := decodeJSONBody(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if err := d.auth.Change(body.OldPIN, body.NewPIN); err != nil {
		status := http.StatusBadRequest
		if err == auth.ErrWrongPIN {
			status = http.StatusUnauthorized
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
