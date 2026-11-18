package api

import (
	"fmt"
	"net/http"
)

type purgeIncomingRequest struct {
	Days    int  `json:"days"`
	Confirm bool `json:"confirm"`
}

// purgeIncoming 按接收时间清理文件。confirm=false 时只返回命中数量，不删除。
func (d *deps) purgeIncoming(w http.ResponseWriter, r *http.Request) {
	request := purgeIncomingRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "清理参数错误: "+err.Error())
		return
	}
	if request.Days <= 0 {
		writeError(w, http.StatusBadRequest, "保留天数必须大于 0")
		return
	}

	if !request.Confirm {
		count, err := d.store.CountOlderThan(request.Days)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "统计超期文件失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"removed":   count,
			"confirmed": false,
			"days":      request.Days,
		})
		return
	}

	removed, err := d.store.PurgeOlderThan(request.Days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "清理超期文件失败: "+err.Error())
		return
	}
	if removed > 0 {
		_ = d.registry.MarkEvent("delete", fmt.Sprintf("按保留期清理接收文件 %d 个", removed), "", 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"removed":   removed,
		"confirmed": true,
		"days":      request.Days,
	})
}

type deleteIncomingRequest struct {
	IDs []string `json:"ids"`
	All bool     `json:"all"`
}

// deleteIncomingBatch 批量删除接收文件；all=true 时清空。
func (d *deps) deleteIncomingBatch(w http.ResponseWriter, r *http.Request) {
	request := deleteIncomingRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "删除参数错误: "+err.Error())
		return
	}
	if !request.All && len(request.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "请指定要删除的文件")
		return
	}

	deleted := 0
	var err error
	if request.All {
		deleted, err = d.store.DeleteAllIncoming()
	} else {
		deleted, err = d.store.DeleteIncomingMany(request.IDs)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "删除文件失败: "+err.Error())
		return
	}
	if deleted > 0 {
		_ = d.registry.MarkEvent("delete", fmt.Sprintf("删除接收文件 %d 个", deleted), "", 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}
