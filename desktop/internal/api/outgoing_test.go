package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func putOutgoingOne(t *testing.T, handler http.Handler, name string, content string) *httptest.ResponseRecorder {
	t.Helper()

	body, contentType := uploadBody(t, name, content)
	return request(t, handler, http.MethodPost, "/api/files/outgoing", body, contentType)
}

func TestPutOutgoingAndList(t *testing.T) {
	handler, store := newTestHandler(t)

	rec := putOutgoingOne(t, handler, "给手机.pdf", "pdf-content")
	if rec.Code != http.StatusCreated {
		t.Fatalf("放入待取区状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	var entry struct {
		Name      string `json:"name"`
		Size      int64  `json:"size"`
		Duplicate bool   `json:"duplicate"`
	}
	decodeJSON(t, rec, &entry)
	if entry.Name != "给手机.pdf" || entry.Duplicate {
		t.Fatalf("返回条目错误: %+v", entry)
	}
	if entry.Size != int64(len("pdf-content")) {
		t.Fatalf("大小 = %d", entry.Size)
	}

	raw, err := os.ReadFile(filepath.Join(store.OutgoingDir(), "给手机.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "pdf-content" {
		t.Fatalf("落盘内容错误: %q", raw)
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list struct {
		Outgoing []struct {
			Name string `json:"name"`
		} `json:"outgoing"`
	}
	decodeJSON(t, listRec, &list)
	if len(list.Outgoing) != 1 || list.Outgoing[0].Name != "给手机.pdf" {
		t.Fatalf("待取列表错误: %+v", list.Outgoing)
	}
}

func TestPutOutgoingDuplicate(t *testing.T) {
	handler, _ := newTestHandler(t)

	putOutgoingOne(t, handler, "a.pdf", "same")
	rec := putOutgoingOne(t, handler, "a.pdf", "same")
	if rec.Code != http.StatusOK {
		t.Fatalf("重复放入应返回 200，实际 %d", rec.Code)
	}

	var entry struct {
		Duplicate bool `json:"duplicate"`
	}
	decodeJSON(t, rec, &entry)
	if !entry.Duplicate {
		t.Fatal("应标记 duplicate")
	}
}

func TestPutOutgoingRejectsEmptyForm(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := request(t, handler, http.MethodPost, "/api/files/outgoing", nil, "multipart/form-data; boundary=x")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("缺少 file 字段应返回 400，实际 %d", rec.Code)
	}
}

func TestDeleteOutgoingBatch(t *testing.T) {
	handler, _ := newTestHandler(t)
	putOutgoingOne(t, handler, "a.pdf", "a")
	putOutgoingOne(t, handler, "b.pdf", "b")

	body := jsonBody(t, map[string]any{"names": []string{"a.pdf"}})
	rec := request(t, handler, http.MethodDelete, "/api/outgoing", body, "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("批量删除状态码错误: %d %s", rec.Code, rec.Body.String())
	}

	var result struct {
		Deleted int `json:"deleted"`
	}
	decodeJSON(t, rec, &result)
	if result.Deleted != 1 {
		t.Fatalf("删除数 = %d, 期望 1", result.Deleted)
	}

	body = jsonBody(t, map[string]any{"all": true})
	rec = request(t, handler, http.MethodDelete, "/api/outgoing", body, "application/json")
	decodeJSON(t, rec, &result)
	if result.Deleted != 1 {
		t.Fatalf("清空数 = %d, 期望 1", result.Deleted)
	}
}

func TestDeleteOutgoingBatchRequiresTarget(t *testing.T) {
	handler, _ := newTestHandler(t)

	body := jsonBody(t, map[string]any{})
	rec := request(t, handler, http.MethodDelete, "/api/outgoing", body, "application/json")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("既没 names 也没 all 应返回 400，实际 %d", rec.Code)
	}
}

func TestPurgeOutgoing(t *testing.T) {
	handler, store := newTestHandler(t)
	putOutgoingOne(t, handler, "old.pdf", "old")
	putOutgoingOne(t, handler, "new.pdf", "new")

	old := time.Now().AddDate(0, 0, -40)
	if err := os.Chtimes(filepath.Join(store.OutgoingDir(), "old.pdf"), old, old); err != nil {
		t.Fatal(err)
	}

	body := jsonBody(t, map[string]any{"days": 30, "confirm": false})
	rec := request(t, handler, http.MethodPost, "/api/outgoing/purge", body, "application/json")
	var preview struct {
		Removed   int  `json:"removed"`
		Confirmed bool `json:"confirmed"`
	}
	decodeJSON(t, rec, &preview)
	if preview.Removed != 1 || preview.Confirmed {
		t.Fatalf("预览结果错误: %+v", preview)
	}

	body = jsonBody(t, map[string]any{"days": 30, "confirm": true})
	rec = request(t, handler, http.MethodPost, "/api/outgoing/purge", body, "application/json")
	var result struct {
		Removed   int  `json:"removed"`
		Confirmed bool `json:"confirmed"`
	}
	decodeJSON(t, rec, &result)
	if result.Removed != 1 || !result.Confirmed {
		t.Fatalf("确认清理结果错误: %+v", result)
	}

	if _, err := os.Stat(filepath.Join(store.OutgoingDir(), "old.pdf")); !os.IsNotExist(err) {
		t.Fatal("超期文件应被删除")
	}
	if _, err := os.Stat(filepath.Join(store.OutgoingDir(), "new.pdf")); err != nil {
		t.Fatal("未超期文件不该被删")
	}
}

func TestPurgeOutgoingRejectsBadDays(t *testing.T) {
	handler, _ := newTestHandler(t)

	body := jsonBody(t, map[string]any{"days": 0, "confirm": true})
	rec := request(t, handler, http.MethodPost, "/api/outgoing/purge", body, "application/json")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("保留天数 <= 0 应返回 400，实际 %d", rec.Code)
	}
}

// 传上去的（而不是手工拷进目录的）中文文件名也要能原样下载回来
func TestDownloadOutgoingUploaded(t *testing.T) {
	handler, _ := newTestHandler(t)
	putOutgoingOne(t, handler, "给手机.pdf", "download-me")

	rec := request(t, handler, http.MethodGet, "/api/outgoing/"+url.PathEscape("给手机.pdf")+"/download", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("下载状态码错误: %d", rec.Code)
	}
	if rec.Body.String() != "download-me" {
		t.Fatalf("下载内容错误: %q", rec.Body.String())
	}
}
