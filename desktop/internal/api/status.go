package api

import (
	"net/http"
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
	PrimaryURL string           `json:"primary_url"`
	Addresses  []NetworkAddress `json:"addresses"`
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
	return networkStatus{PrimaryURL: primary, Addresses: addresses}
}

func newMiniProgramStatus(devices []registry.Device) miniProgramStatus {
	result := miniProgramStatus{
		LastSeen: "",
		Devices:  []deviceStatus{},
	}

	for _, device := range devices {
		seconds := secondsSince(device.LastSeen)
		online := seconds >= 0 && seconds <= onlineWindowSeconds
		result.Devices = append(result.Devices, deviceStatus{
			Device:     device,
			Online:     online,
			SecondsAgo: seconds,
		})
		if result.LastSeen == "" {
			result.LastSeen = device.LastSeen
			result.SecondsAgo = seconds
			result.Online = online
		}
	}
	return result
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
