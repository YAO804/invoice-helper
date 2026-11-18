package api

import (
	"encoding/json"
	"net/http"
	"testing"
)

func uploadOne(t *testing.T, handler http.Handler, name string) string {
	t.Helper()

	// 内容随文件名变化，避免 SHA 相同被判为重复而返回 200
	body, contentType := uploadBody(t, name, "content of "+name)
	rec := request(t, handler, http.MethodPost, "/api/files/upload", body, contentType)
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("上传失败: %d %s", rec.Code, rec.Body.String())
	}

	var record struct {
		ID string `json:"id"`
	}
	decodeJSON(t, rec, &record)
	return record.ID
}

func TestDeleteIncomingBatch(t *testing.T) {
	handler, _ := newTestHandler(t)
	first := uploadOne(t, handler, "a.xml")
	uploadOne(t, handler, "b.xml")

	body := jsonBody(t, map[string]any{"ids": []string{first}})
	rec := request(t, handler, http.MethodDelete, "/api/incoming", body, "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("批量删除状态码错误: %d %s", rec.Code, rec.Body.String())
	}

	var result struct {
		Deleted int `json:"deleted"`
	}
	decodeJSON(t, rec, &result)
	if result.Deleted != 1 {
		t.Fatalf("批量删除数量错误: %d", result.Deleted)
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list fileListResponse
	decodeJSON(t, listRec, &list)
	if len(list.Incoming) != 1 {
		t.Fatalf("剩余文件数量错误: %+v", list.Incoming)
	}
}

func TestDeleteIncomingAll(t *testing.T) {
	handler, _ := newTestHandler(t)
	uploadOne(t, handler, "a.xml")
	uploadOne(t, handler, "b.xml")

	body := jsonBody(t, map[string]any{"all": true})
	rec := request(t, handler, http.MethodDelete, "/api/incoming", body, "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("清空状态码错误: %d %s", rec.Code, rec.Body.String())
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list fileListResponse
	decodeJSON(t, listRec, &list)
	if len(list.Incoming) != 0 {
		t.Fatalf("清空后仍有文件: %+v", list.Incoming)
	}
}

func TestPurgeIncomingPreviewAndRejectsBadDays(t *testing.T) {
	handler, _ := newTestHandler(t)
	uploadOne(t, handler, "a.xml")

	// 刚上传的文件不到 30 天，预览应为 0 且不删除
	body := jsonBody(t, map[string]any{"days": 30, "confirm": false})
	rec := request(t, handler, http.MethodPost, "/api/incoming/purge", body, "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("预览状态码错误: %d %s", rec.Code, rec.Body.String())
	}

	var preview struct {
		Removed   int  `json:"removed"`
		Confirmed bool `json:"confirmed"`
		Days      int  `json:"days"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &preview); err != nil {
		t.Fatal(err)
	}
	if preview.Removed != 0 || preview.Confirmed || preview.Days != 30 {
		t.Fatalf("预览结果错误: %+v", preview)
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list fileListResponse
	decodeJSON(t, listRec, &list)
	if len(list.Incoming) != 1 {
		t.Fatal("预览不该删除文件")
	}

	badBody := jsonBody(t, map[string]any{"days": 0, "confirm": true})
	badRec := request(t, handler, http.MethodPost, "/api/incoming/purge", badBody, "application/json")
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("保留天数 <= 0 应拒绝: %d", badRec.Code)
	}
}
