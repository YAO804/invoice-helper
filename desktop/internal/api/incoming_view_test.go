package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// uploadForPreview 传一个文件上去，返回它的记录 id。
func uploadForPreview(t *testing.T, handler http.Handler, name string, content string) string {
	t.Helper()

	body, contentType := uploadBody(t, name, content)
	rec := request(t, handler, http.MethodPost, "/api/files/upload", body, contentType)
	if rec.Code != http.StatusCreated {
		t.Fatalf("上传 %s 失败: %d %s", name, rec.Code, rec.Body.String())
	}

	var record struct {
		ID string `json:"id"`
	}
	decodeJSON(t, rec, &record)
	return record.ID
}

func TestListFilesReportsPreviewKind(t *testing.T) {
	handler, _ := newTestHandler(t)
	uploadForPreview(t, handler, "发票.pdf", "%PDF-1.4")
	uploadForPreview(t, handler, "发票.ofd", "PK")

	rec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list struct {
		Incoming []struct {
			Name    string `json:"name"`
			Preview string `json:"preview"`
		} `json:"incoming"`
	}
	decodeJSON(t, rec, &list)

	kinds := map[string]string{}
	for _, item := range list.Incoming {
		kinds[item.Name] = item.Preview
	}
	if kinds["发票.pdf"] != "pdf" {
		t.Fatalf("pdf 的 preview = %q, 期望 pdf", kinds["发票.pdf"])
	}
	if kinds["发票.ofd"] != "" {
		t.Fatalf("ofd 不该有 preview，实际 %q", kinds["发票.ofd"])
	}
}

func TestViewIncomingPDFIsInline(t *testing.T) {
	handler, _ := newTestHandler(t)
	id := uploadForPreview(t, handler, "发票.pdf", "%PDF-1.4 body")

	rec := request(t, handler, http.MethodGet, "/api/incoming/"+id+"/view", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("预览状态码 = %d, 期望 200: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Fatalf("Content-Type = %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "inline") {
		t.Fatalf("Content-Disposition = %q, 预览必须是 inline", cd)
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("缺少 nosniff，浏览器可能把文本猜成别的类型")
	}
	if rec.Body.String() != "%PDF-1.4 body" {
		t.Fatalf("内容不对: %q", rec.Body.String())
	}
}

func TestViewIncomingTextIsPlainText(t *testing.T) {
	handler, _ := newTestHandler(t)
	// 故意塞一段 HTML：预览必须按纯文本回，不能被当成页面执行
	payload := `<?xml version="1.0"?><script>alert(1)</script>`
	id := uploadForPreview(t, handler, "发票.xml", payload)

	rec := request(t, handler, http.MethodGet, "/api/incoming/"+id+"/view", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("预览状态码 = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/plain; charset=utf-8" {
		t.Fatalf("Content-Type = %q, 期望 text/plain", ct)
	}
	if rec.Body.String() != payload {
		t.Fatalf("内容不对: %q", rec.Body.String())
	}
}

func TestViewIncomingRejectsUnsupported(t *testing.T) {
	handler, _ := newTestHandler(t)
	id := uploadForPreview(t, handler, "发票.ofd", "PK fake ofd")

	rec := request(t, handler, http.MethodGet, "/api/incoming/"+id+"/view", nil, "")
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("状态码 = %d, 期望 415", rec.Code)
	}

	var msg struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&msg); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(msg.Error, "下载") {
		t.Fatalf("错误信息应引导用户下载，实际 %q", msg.Error)
	}
}

func TestViewIncomingHTMLRejected(t *testing.T) {
	handler, _ := newTestHandler(t)
	id := uploadForPreview(t, handler, "evil.html", "<script>alert(1)</script>")

	rec := request(t, handler, http.MethodGet, "/api/incoming/"+id+"/view", nil, "")
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("HTML 不该允许预览，状态码 = %d", rec.Code)
	}
}

func TestViewIncomingMissingRecord(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := request(t, handler, http.MethodGet, "/api/incoming/missing/view", nil, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("状态码 = %d, 期望 404", rec.Code)
	}
}

func TestDownloadStaysAttachment(t *testing.T) {
	handler, _ := newTestHandler(t)
	id := uploadForPreview(t, handler, "发票.pdf", "%PDF-1.4")

	rec := request(t, handler, http.MethodGet, "/api/incoming/"+id+"/download", nil, "")
	if cd := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(cd, "attachment") {
		t.Fatalf("下载必须仍是 attachment，实际 %q", cd)
	}
}
