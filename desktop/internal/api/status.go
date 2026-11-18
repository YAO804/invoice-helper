package api

import (
	"net/http"
	"sort"
	"time"

	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/registry"
)

type statusResponse struct {
	Service     serviceStatus     `json:"service"`
	Network     networkStatus     `json:"network"`
	MiniProgram miniProgramStatus `json:"mini_program"`
	Stats       files.Stats       `json:"stats"`
	Events      []registry.Event  `json:"events"`
}

type serviceStatus struct {
	OK        bool   `json:"ok"`
	Name      string `json:"name"`
	Version   string `json:"version"`
	Addr      string `json:"addr"`
	StartedAt string `json:"started_at"`
	UptimeSec int64  `json:"uptime_sec"`
}

type networkStatus struct {
	PrimaryURL  string           `json:"primary_url"`
	ConnectCode string           `json:"connect_code"`
	Addresses   []NetworkAddress `json:"addresses"`
}

type miniProgramStatus struct {
	Online     bool           `json:"online"`
	LastSeen   string         `json:"last_seen"`
	SecondsAgo int64          `json:"seconds_ago"`
	Devices    []deviceStatus `json:"devices"`
}

type deviceStatus struct {
	registry.Device
	Online     bool  `json:"online"`
	SecondsAgo int64 `json:"seconds_ago"`
}

func (d *deps) status(w http.ResponseWriter, r *http.Request) {
	devices, events, err := d.registry.Snapshot()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取设备状态失败: "+err.Error())
		return
	}

	stats, err := d.store.Stats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取文件统计失败: "+err.Error())
		return
	}

	addresses := LANAddresses(portFromAddr(d.addr))
	response := statusResponse{
		Service: serviceStatus{
			OK:        true,
			Name:      "invoice-helper-desktop",
			Version:   serviceVersion,
			Addr:      d.addr,
			StartedAt: d.startedAt.UTC().Format(time.RFC3339),
			UptimeSec: int64(time.Since(d.startedAt).Seconds()),
		},
		Network:     newNetworkStatus(addresses),
		MiniProgram: newMiniProgramStatus(devices),
		Stats:       stats,
		Events:      events,
	}
	writeJSON(w, http.StatusOK, response)
}

func newNetworkStatus(addresses []NetworkAddress) networkStatus {
	primary := ""
	if len(addresses) > 0 {
		primary = addresses[0].URL
	}
	return networkStatus{PrimaryURL: primary, ConnectCode: ConnectCode(primary), Addresses: addresses}
}

// newMiniProgramStatus 把设备列表汇总成卡片上那三个数。
//
// 汇总口径必须是「最新那台」和「是否有任意一台在线」，不能取列表第一个：
// 注册表里的顺序是设备**首次出现**的顺序，一台早就不用的测试机排在最前面，
// 就会让卡片显示「离线 46 分钟前」，而下面列表里另一台 13 秒前刚发过心跳。
func newMiniProgramStatus(devices []registry.Device) miniProgramStatus {
	result := miniProgramStatus{
		LastSeen:   "",
		SecondsAgo: -1, // -1 表示没有任何可解析的心跳，前端会显示「未知」
		Devices:    []deviceStatus{},
	}

	for _, device := range devices {
		seconds := secondsSince(device.LastSeen)
		online := seconds >= 0 && seconds <= onlineWindowSeconds

		result.Devices = append(result.Devices, deviceStatus{
			Device:     device,
			Online:     online,
			SecondsAgo: seconds,
		})

		// 多设备时用户只关心「现在连得上吗」，所以任意一台在线就算在线
		if online {
			result.Online = true
		}

		if seconds >= 0 && (result.SecondsAgo < 0 || seconds < result.SecondsAgo) {
			result.SecondsAgo = seconds
			result.LastSeen = device.LastSeen
		}
	}

	sortByRecency(result.Devices)
	return result
}

// sortByRecency 按最近心跳倒序，让列表第一条就是卡片汇总的那台。
// 解析失败的时间没有可比性，统一沉到最后。
func sortByRecency(devices []deviceStatus) {
	sort.SliceStable(devices, func(i, j int) bool {
		if devices[i].SecondsAgo < 0 {
			return false
		}
		if devices[j].SecondsAgo < 0 {
			return true
		}
		return devices[i].SecondsAgo < devices[j].SecondsAgo
	})
}

func secondsSince(value string) int64 {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return -1
	}
	seconds := int64(time.Since(parsed).Seconds())
	if seconds < 0 {
		return 0
	}
	return seconds
}
