package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"invoice-helper/desktop/internal/registry"
)

// MinutesAgo 造一条 N 分钟前的心跳时间戳。
func minutesAgo(minutes int) string {
	return time.Now().Add(-time.Duration(minutes) * time.Minute).UTC().Format(time.RFC3339)
}

func device(id, name string, minutes int) registry.Device {
	return registry.Device{
		ID:       id,
		Name:     name,
		Version:  "1.0.0",
		LastSeen: minutesAgo(minutes),
	}
}

// seedDevices 直接写 registry.json，绕开 /api/devices/heartbeat 不能指定时间戳的限制。
func seedDevices(t *testing.T, root string, devices []registry.Device) {
	t.Helper()

	content, err := json.Marshal(map[string]any{"devices": devices, "events": []any{}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "registry.json"), content, 0644); err != nil {
		t.Fatal(err)
	}
}

func fetchStatus(t *testing.T, handler http.Handler) miniProgramStatus {
	t.Helper()

	rec := request(t, handler, http.MethodGet, "/api/status", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("状态码错误: %d", rec.Code)
	}
	var status statusResponse
	decodeJSON(t, rec, &status)
	return status.MiniProgram
}

// 用户实际遇到的场景：一台 46 分钟前发过心跳的测试机排在列表最前面，
// 另一台 13 秒前刚发过心跳，卡片却跟着第一台显示「离线」。
func TestStatusOnlineWhenAnyDeviceOnline(t *testing.T) {
	handler, root := newTestHandlerRoot(t)
	seedDevices(t, root, []registry.Device{
		device("mp-smoke", "test", 46),
		device("mp-real", "攒票小匣小程序", 0),
	})

	mini := fetchStatus(t, handler)
	if !mini.Online {
		t.Fatalf("有设备在线，卡片必须是在线: %+v", mini)
	}
	if mini.SecondsAgo > onlineWindowSeconds {
		t.Fatalf("最近心跳应取最新的那台，实际 %d 秒前", mini.SecondsAgo)
	}
	if mini.LastSeen == "" {
		t.Fatal("最近心跳时间不能为空")
	}
}

// 全部离线时，口径依然是「最新那台」，不能用最旧的那台冒充最近心跳。
func TestStatusOfflineUsesNewestDevice(t *testing.T) {
	handler, root := newTestHandlerRoot(t)
	seedDevices(t, root, []registry.Device{
		device("mp-old", "很早的测试机", 120),
		device("mp-mid", "刚才用过", 10),
	})

	mini := fetchStatus(t, handler)
	if mini.Online {
		t.Fatalf("全部超过窗口，应判离线: %+v", mini)
	}

	want := int64(10 * 60)
	if mini.SecondsAgo < want-5 || mini.SecondsAgo > want+5 {
		t.Fatalf("最近心跳应约为 %d 秒前，实际 %d", want, mini.SecondsAgo)
	}
}

// 列表顺序按最近心跳倒序，第一条就是卡片汇总的那台，避免表头和卡片对不上。
func TestStatusDevicesSortedByRecency(t *testing.T) {
	handler, root := newTestHandlerRoot(t)
	seedDevices(t, root, []registry.Device{
		device("mp-old", "最早", 120),
		device("mp-new", "最新", 0),
		device("mp-mid", "中间", 30),
	})

	mini := fetchStatus(t, handler)
	got := []string{}
	for _, item := range mini.Devices {
		got = append(got, item.ID)
	}
	want := []string{"mp-new", "mp-mid", "mp-old"}
	if len(got) != len(want) {
		t.Fatalf("设备数量错误: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("顺序错误，期望 %v，实际 %v", want, got)
		}
	}
}

// 没有设备时不能显示成「刚刚」——seconds_ago 用 -1 表示未知。
func TestStatusNoDevices(t *testing.T) {
	handler, _ := newTestHandlerRoot(t)

	mini := fetchStatus(t, handler)
	if mini.Online {
		t.Fatal("没有设备时不能显示在线")
	}
	if mini.SecondsAgo != -1 {
		t.Fatalf("没有设备时 seconds_ago 应为 -1，实际 %d", mini.SecondsAgo)
	}
	if mini.LastSeen != "" {
		t.Fatalf("没有设备时 last_seen 应为空，实际 %q", mini.LastSeen)
	}
	if len(mini.Devices) != 0 {
		t.Fatalf("没有设备时列表应为空，实际 %d 条", len(mini.Devices))
	}
}

// 时间戳坏掉的记录不能把正常记录挤掉，也不能让卡片误判。
func TestStatusBadTimestampDoesNotWin(t *testing.T) {
	handler, root := newTestHandlerRoot(t)
	broken := registry.Device{ID: "mp-broken", Name: "坏时间", Version: "1.0.0", LastSeen: "不是时间"}
	seedDevices(t, root, []registry.Device{
		broken,
		device("mp-real", "正常设备", 0),
	})

	mini := fetchStatus(t, handler)
	if !mini.Online {
		t.Fatal("正常设备在线，卡片应在线")
	}
	if mini.SecondsAgo > onlineWindowSeconds {
		t.Fatalf("最近心跳应来自正常设备，实际 %d 秒前", mini.SecondsAgo)
	}
	if last := mini.Devices[len(mini.Devices)-1]; last.ID != "mp-broken" {
		t.Fatalf("时间异常的设备应排最后，实际最后一条是 %s", last.ID)
	}
}
