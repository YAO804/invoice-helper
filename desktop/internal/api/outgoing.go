package api

import (
	"fmt"
	"net/http"

	"invoice-helper/desktop/internal/files"
)

// putOutgoing 接收电脑上的文件，复制进待取区等小程序下载（POST /api/files/outgoing）。
//
// 和 /api/files/upload 的方向相反：那个是小程序 → 电脑，这个是电脑 → 小程序。
func (d *deps) putOutgoing(w http.ResponseWriter, r *http.Request) {
	limit := int64(files.MaxUploadBytes + uploadOverhead)
	r.Body = http.MaxBytesReader(w, r.Body, limit)

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "multipart 解析失败: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "缺少 file 字段")
		return
	}
	defer file.Close()

	entry, duplicate, err := d.store.SaveOutgoing(header.Filename, file, header.Size)
	if err != nil {
		writeError(w, http.StatusBadRequest, "保存失败: "+err.Error())
		return
	}

	if !duplicate {
		_ = d.registry.MarkEvent("put", "加入待取文件 "+entry.Name, "", entry.Size)
	}

	status := http.StatusCreated
	if duplicate {
		status = http.StatusOK
	}
	writeJSON(w, status, map[string]any{
		"name":        entry.Name,
		"size":        entry.Size,
		"modified_at": entry.ModifiedAt,
		"duplicate":   duplicate,
	})
}

type deleteOutgoingRequest struct {
	Names []string `json:"names"`
	All   bool     `json:"all"`
}

// deleteOutgoingBatch 批量删除待取文件；all=true 时清空。
func (d *deps) deleteOutgoingBatch(w http.ResponseWriter, r *http.Request) {
	request := deleteOutgoingRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "删除参数错误: "+err.Error())
		return
	}
	if !request.All && len(request.Names) == 0 {
		writeError(w, http.StatusBadRequest, "请指定要删除的文件")
		return
	}

	deleted := 0
	var err error
	if request.All {
		deleted, err = d.store.DeleteAllOutgoing()
	} else {
		deleted, err = d.store.DeleteOutgoingMany(request.Names)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "删除文件失败: "+err.Error())
		return
	}
	if deleted > 0 {
		_ = d.registry.MarkEvent("delete", fmt.Sprintf("删除待取文件 %d 个", deleted), "", 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}

type purgeOutgoingRequest struct {
	Days    int  `json:"days"`
	Confirm bool `json:"confirm"`
}

// purgeOutgoing 按修改时间清理待取文件。confirm=false 时只返回命中数量。
func (d *deps) purgeOutgoing(w http.ResponseWriter, r *http.Request) {
	request := purgeOutgoingRequest{}
	if err := decodeJSONBody(r, &request); err != nil {
		writeError(w, http.StatusBadRequest, "清理参数错误: "+err.Error())
		return
	}
	if request.Days <= 0 {
		writeError(w, http.StatusBadRequest, "保留天数必须大于 0")
		return
	}

	if !request.Confirm {
		count, err := d.store.CountOutgoingOlderThan(request.Days)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "统计超期待取文件失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"removed":   count,
			"confirmed": false,
			"days":      request.Days,
		})
		return
	}

	removed, err := d.store.PurgeOutgoingOlderThan(request.Days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "清理超期待取文件失败: "+err.Error())
		return
	}
	if removed > 0 {
		_ = d.registry.MarkEvent("delete", fmt.Sprintf("按保留期清理待取文件 %d 个", removed), "", 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"removed":   removed,
		"confirmed": true,
		"days":      request.Days,
	})
}
