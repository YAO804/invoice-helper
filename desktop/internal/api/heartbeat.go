package api

import "net/http"

type heartbeatRequest struct {
	DeviceID string `json:"device_id"`
	Name     string `json:"name"`
	Version  string `json:"version"`
}

func (d *deps) heartbeat(w http.ResponseWriter, r *http.Request) {
	request := heartbeatRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "心跳参数错误: "+err.Error())
		return
	}
	if request.DeviceID == "" {
		writeError(w, http.StatusBadRequest, "缺少 device_id")
		return
	}

	device, err := d.registry.Touch(request.DeviceID, request.Name, request.Version)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "记录设备失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"device": device,
	})
}
