package api

import (
	"net/http"

	"invoice-helper/desktop/internal/files"
)

// incomingItem 是列表里的一条接收记录，额外带上能否预览。
// 放在响应结构里而不是 Record 上：Record 会序列化进 index.json，
// 预览类型是按文件名算出来的，不该落盘。
type incomingItem struct {
	files.Record
	Preview string `json:"preview"`
}

type fileListResponse struct {
	Incoming []incomingItem       `json:"incoming"`
	Outgoing []files.OutgoingFile `json:"outgoing"`
}

func (d *deps) listFiles(w http.ResponseWriter, r *http.Request) {
	incoming, err := d.store.ListRecords()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取上传记录失败: "+err.Error())
		return
	}

	outgoing, err := d.store.ListOutgoing()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取待取文件失败: "+err.Error())
		return
	}

	items := make([]incomingItem, 0, len(incoming))
	for _, record := range incoming {
		items = append(items, incomingItem{
			Record:  record,
			Preview: files.PreviewKind(record.Name),
		})
	}

	writeJSON(w, http.StatusOK, fileListResponse{
		Incoming: items,
		Outgoing: outgoing,
	})
}
