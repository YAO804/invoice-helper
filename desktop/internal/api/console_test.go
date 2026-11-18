package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func jsonBody(t *testing.T, payload any) io.Reader {
	t.Helper()

	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	return bytes.NewReader(data)
}

func TestHeartbeatAndStatus(t *testing.T) {
	handler, _ := newTestHandler(t)
	payload := map[string]string{
		"device_id": "phone-1",
		"name":      "测试手机",
		"version":   "1.0.0",
	}

	rec := request(t, handler, http.MethodPost, "/api/devices/heartbeat", jsonBody(t, payload), "application/json")
	if rec.Code != http.StatusOK {
		t.Fatalf("心跳状态码错误: %d, body=%s", rec.Code, rec.Body.String())
	}

	statusRec := request(t, handler, http.MethodGet, "/api/status", nil, "")
	if statusRec.Code != http.StatusOK {
		t.Fatalf("状态状态码错误: %d", statusRec.Code)
	}

	var status statusResponse
	decodeJSON(t, statusRec, &status)
	if !status.MiniProgram.Online || len(status.MiniProgram.Devices) != 1 {
		t.Fatalf("小程序在线状态错误: %+v", status.MiniProgram)
	}
	if status.Service.Version != serviceVersion {
		t.Fatalf("服务版本错误: %s", status.Service.Version)
	}
}

func TestStatusShowsUploadStatsAndEvents(t *testing.T) {
	handler, _ := newTestHandler(t)
	body, contentType := uploadBody(t, "test.xml", "<xml/>")

	uploadRec := request(t, handler, http.MethodPost, "/api/files/upload", body, contentType)
	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("上传状态码错误: %d", uploadRec.Code)
	}

	statusRec := request(t, handler, http.MethodGet, "/api/status", nil, "")
	var status statusResponse
	decodeJSON(t, statusRec, &status)

	if status.Stats.IncomingCount != 1 || status.Stats.TodayCount != 1 {
		t.Fatalf("统计错误: %+v", status.Stats)
	}
	if len(status.Events) == 0 || status.Events[0].Kind != "upload" {
		t.Fatalf("事件记录错误: %+v", status.Events)
	}
}

func TestDeleteIncoming(t *testing.T) {
	handler, _ := newTestHandler(t)
	body, contentType := uploadBody(t, "delete-me.xml", "hello")

	uploadRec := request(t, handler, http.MethodPost, "/api/files/upload", body, contentType)
	var record struct {
		ID string `json:"id"`
	}
	decodeJSON(t, uploadRec, &record)

	deleteRec := request(t, handler, http.MethodDelete, "/api/incoming/"+record.ID, nil, "")
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("删除状态码错误: %d, body=%s", deleteRec.Code, deleteRec.Body.String())
	}

	listRec := request(t, handler, http.MethodGet, "/api/files", nil, "")
	var list fileListResponse
	decodeJSON(t, listRec, &list)
	if len(list.Incoming) != 0 {
		t.Fatalf("删除后仍有记录: %+v", list.Incoming)
	}
}

func TestDeleteOutgoing(t *testing.T) {
	handler, store := newTestHandler(t)
	path := filepath.Join(store.OutgoingDir(), "hello.txt")
	if err := os.WriteFile(path, []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}

	deleteRec := request(t, handler, http.MethodDelete, "/api/outgoing/hello.txt", nil, "")
	if deleteRec.Code != http.StatusOK {
		t.Fatalf("删除状态码错误: %d", deleteRec.Code)
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("待取文件仍然存在")
	}
}

func TestStaticAssetsNotCached(t *testing.T) {
	handler, _ := newTestHandler(t)

	// 前端资源是 embed 进二进制的，浏览器留旧副本会让人误判「改了没生效」
	for _, path := range []string{"/", "/render.js", "/preview.js", "/style.css"} {
		rec := request(t, handler, http.MethodGet, path, nil, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("%s 状态码错误: %d", path, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Fatalf("%s 的 Cache-Control 应为 no-store，实际 %q", path, got)
		}
	}
}

func TestIndexWiresPreviewScript(t *testing.T) {
	handler, _ := newTestHandler(t)
	rec := request(t, handler, http.MethodGet, "/", nil, "")
	body := rec.Body.String()

	// 弹层的标记和脚本缺任何一个，文件名按钮都会变成「点了没反应」
	for _, want := range []string{
		`id="previewModal"`, `id="closePreviewBtn"`, "/preview.js", "/events.js",
		`data-stat-filter="duplicates"`, `data-stat-filter="needfill"`, `data-stat-filter="batch"`,
		"/ledger-stats.js",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("首页缺少 %s", want)
		}
	}

	// preview.js / events.js 在加载时注册点击委托或供控制台页调用，必须早于 app.js
	for _, name := range []string{"/preview.js", "/events.js"} {
		if strings.Index(body, name) > strings.Index(body, "/app.js") {
			t.Fatalf("%s 必须早于 app.js", name)
		}
	}

	// ledger-stats.js 被 ledger-app.js 调用，必须早于它
	if strings.Index(body, "/ledger-stats.js") > strings.Index(body, "/ledger-app.js") {
		t.Fatal("ledger-stats.js 必须早于 ledger-app.js")
	}
}

func TestPortFromAddr(t *testing.T) {
	if got := portFromAddr(":9000"); got != "9000" {
		t.Fatalf("端口解析错误: %s", got)
	}
	if got := portFromAddr("bad-address"); got != "8765" {
		t.Fatalf("非法地址兜底错误: %s", got)
	}
}
func TestAddressScore(t *testing.T) {
	wlan := addressScore("WLAN", net.ParseIP("192.168.1.20"))
	tunnel := addressScore("NexPathTunnel", net.ParseIP("172.20.0.1"))

	if tunnel != 0 {
		t.Fatalf("虚拟网卡应该被过滤: %d", tunnel)
	}
	if wlan <= 0 || wlan <= tunnel {
		t.Fatalf("无线网卡应该优先: wlan=%d tunnel=%d", wlan, tunnel)
	}
}
