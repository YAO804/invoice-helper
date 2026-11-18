package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newRecorder(handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

// 未带任何凭证时，受保护接口应被拦下。
func TestProtectedWithoutCredential(t *testing.T) {
	handler, _ := newTestHandler(t)
	rec := requestNoPIN(t, handler, http.MethodGet, "/api/files")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("无凭证应返回 401，实际 %d", rec.Code)
	}
}

// 错误 PIN 同样拦下。
func TestProtectedWithWrongPIN(t *testing.T) {
	handler, _ := newTestHandler(t)
	req, _ := http.NewRequest(http.MethodGet, "/api/files", nil)
	req.Header.Set("X-PIN", "000000")
	rec := newRecorder(handler, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("错误 PIN 应返回 401，实际 %d", rec.Code)
	}
}

// 白名单接口无需凭证：健康探活、登录挑战码、二维码。
func TestPublicAPIsOpen(t *testing.T) {
	handler, _ := newTestHandler(t)
	for _, path := range []string{"/api/health", "/api/auth/challenge"} {
		rec := requestNoPIN(t, handler, http.MethodGet, path)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s 应免鉴权，实际 %d", path, rec.Code)
		}
	}
}

// 静态首页免鉴权，否则用户连登录页都打不开。
func TestIndexOpenWithoutCredential(t *testing.T) {
	handler, _ := newTestHandler(t)
	rec := requestNoPIN(t, handler, http.MethodGet, "/")
	if rec.Code != http.StatusOK {
		t.Fatalf("首页应免鉴权，实际 %d", rec.Code)
	}
}

// 完整扫码登录链路：请码 → 小程序确认 → 网页换会话 → 会话访问受保护接口。
func TestQRLoginFlow(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := requestNoPIN(t, handler, http.MethodGet, "/api/auth/challenge")
	if rec.Code != http.StatusOK {
		t.Fatalf("请码失败: %d", rec.Code)
	}
	var challenge struct{ Code string }
	decodeJSON(t, rec, &challenge)
	if challenge.Code == "" {
		t.Fatal("挑战码为空")
	}

	// 未确认前不能换会话
	pending := requestNoPIN(t, handler, http.MethodGet, "/api/auth/session?c="+challenge.Code)
	if pending.Code != http.StatusUnauthorized {
		t.Fatalf("未确认不应换到会话: %d", pending.Code)
	}

	// PIN 错误不能确认
	badConfirm := postJSONNoPIN(t, handler, "/api/auth/confirm", `{"code":"`+challenge.Code+`","pin":"000000"}`)
	if badConfirm.Code != http.StatusUnauthorized {
		t.Fatalf("PIN 错误不应确认: %d", badConfirm.Code)
	}

	// PIN 正确确认
	confirm := postJSONNoPIN(t, handler, "/api/auth/confirm", `{"code":"`+challenge.Code+`","pin":"`+testPIN+`"}`)
	if confirm.Code != http.StatusOK {
		t.Fatalf("确认失败: %d %s", confirm.Code, confirm.Body.String())
	}

	// 换会话，响应里应种下 cookie
	session := requestNoPIN(t, handler, http.MethodGet, "/api/auth/session?c="+challenge.Code)
	if session.Code != http.StatusOK {
		t.Fatalf("换会话失败: %d", session.Code)
	}
	cookies := session.Result().Cookies()
	var token string
	for _, c := range cookies {
		if c.Name == sessionCookie {
			token = c.Value
		}
	}
	if token == "" {
		t.Fatal("会话未写入 cookie")
	}

	// 带会话 cookie 能访问受保护接口
	req, _ := http.NewRequest(http.MethodGet, "/api/files", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	if rec := newRecorder(handler, req); rec.Code != http.StatusOK {
		t.Fatalf("会话应可访问受保护接口: %d", rec.Code)
	}

	// 一个挑战码只能用一次
	reuse := requestNoPIN(t, handler, http.MethodGet, "/api/auth/session?c="+challenge.Code)
	if reuse.Code != http.StatusUnauthorized {
		t.Fatalf("挑战码不应复用: %d", reuse.Code)
	}
}

// 改 PIN 后：旧 PIN 失效、旧会话失效、新 PIN 可用。
func TestChangePINInvalidatesSession(t *testing.T) {
	handler, _ := newTestHandler(t)

	// 先拿一个会话
	rec := requestNoPIN(t, handler, http.MethodGet, "/api/auth/challenge")
	var ch struct{ Code string }
	decodeJSON(t, rec, &ch)
	postJSONNoPIN(t, handler, "/api/auth/confirm", `{"code":"`+ch.Code+`","pin":"`+testPIN+`"}`)
	sess := requestNoPIN(t, handler, http.MethodGet, "/api/auth/session?c="+ch.Code)
	var token string
	for _, c := range sess.Result().Cookies() {
		if c.Name == sessionCookie {
			token = c.Value
		}
	}

	// 改 PIN
	change := postJSONNoPIN(t, handler, "/api/auth/pin", `{"old_pin":"`+testPIN+`","new_pin":"999999"}`)
	if change.Code != http.StatusUnauthorized {
		t.Fatalf("改 PIN 接口本身要鉴权，无凭证应 401，实际 %d", change.Code)
	}

	// 带会话改 PIN
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/pin", strings.NewReader(`{"old_pin":"`+testPIN+`","new_pin":"999999"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	if rec := newRecorder(handler, req); rec.Code != http.StatusOK {
		t.Fatalf("带会话改 PIN 应成功: %d %s", rec.Code, rec.Body.String())
	}

	// 旧会话失效
	old := httpReqWithSession(http.MethodGet, "/api/files", token)
	if rec := newRecorder(handler, old); rec.Code != http.StatusUnauthorized {
		t.Fatalf("改 PIN 后旧会话应失效: %d", rec.Code)
	}
	// 新 PIN 可用
	if rec := requestWithPIN(t, handler, http.MethodGet, "/api/files", "999999"); rec.Code != http.StatusOK {
		t.Fatalf("新 PIN 应可用: %d", rec.Code)
	}
}

func requestNoPIN(t *testing.T, handler http.Handler, method string, path string) *httptest.ResponseRecorder {
	t.Helper()
	req, _ := http.NewRequest(method, path, nil)
	return newRecorder(handler, req)
}

func postJSONNoPIN(t *testing.T, handler http.Handler, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return newRecorder(handler, req)
}

func requestWithPIN(t *testing.T, handler http.Handler, method string, path string, pin string) *httptest.ResponseRecorder {
	t.Helper()
	req, _ := http.NewRequest(method, path, nil)
	req.Header.Set("X-PIN", pin)
	return newRecorder(handler, req)
}

func httpReqWithSession(method string, path string, token string) *http.Request {
	req, _ := http.NewRequest(method, path, nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: token})
	return req
}
