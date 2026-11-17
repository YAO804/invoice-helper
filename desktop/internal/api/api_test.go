package api

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/registry"
)

func newTestHandler(t *testing.T) (http.Handler, *files.Store) {
	t.Helper()

	root := t.TempDir()
	store, err := files.New(root)
	if err != nil {
		t.Fatal(err)
	}
	deviceRegistry, err := registry.New(root)
	if err != nil {
		t.Fatal(err)
	}
	return NewHandler(":8765", store, deviceRegistry), store
}

func request(t *testing.T, handler http.Handler, method string, path string, body io.Reader, contentType string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, path, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func uploadBody(t *testing.T, name string, content string) (io.Reader, string) {
	t.Helper()

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(part, content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &buf, writer.FormDataContentType()
}

func decodeJSON(t *testing.T, rec *httptest.ResponseRecorder, target any) {
	t.Helper()

	if err := json.NewDecoder(rec.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func TestHealth(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := request(t, handler, http.MethodGet, "/api/health", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("状态码错误: %d", rec.Code)
	}

	var data map[string]any
	decodeJSON(t, rec, &data)
	if data["ok"] != true {
		t.Fatalf("health 返回错误: %+v", data)
	}
}

func TestUploadAndList(t *testing.T) {
	handler, store := newTestHandler(t)
	body, contentType := uploadBody(t, "test.xml", "<xml/>")

	rec := request(t, handler, http.MethodPost, "/api/files/upload", body, contentType)
	if rec.Code != http.StatusCreated {
		t.Fatalf("上传状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	var record files.Record
	decodeJSON(t, rec, &record)
	if record.Name != "test.xml" || record.Duplicate {
		t.Fatalf("上传记录错误: %+v", record)
	}

	if _, err := os.ReadFile(store.IncomingRecordPath(record)); err != nil {
		t.Fatal(err)
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	if listRec.Code != http.StatusOK {
		t.Fatalf("列表状态码错误: %d", listRec.Code)
	}

	var list fileListResponse
	decodeJSON(t, listRec, &list)
	if len(list.Incoming) != 1 {
		t.Fatalf("上传列表数量错误: %+v", list.Incoming)
	}
}

func TestDownloadOutgoing(t *testing.T) {
	handler, store := newTestHandler(t)
	path := filepath.Join(store.OutgoingDir(), "hello.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	rec := request(t, handler, http.MethodGet, "/api/outgoing/hello.txt/download", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("下载状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "hello" {
		t.Fatalf("下载内容错误: %s", rec.Body.String())
	}
}

func TestIndexPage(t *testing.T) {
	handler, _ := newTestHandler(t)

	rec := request(t, handler, http.MethodGet, "/", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("首页状态码错误: %d", rec.Code)
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte("桌面端")) {
		t.Fatal("首页没有加载本地网页")
	}
}
