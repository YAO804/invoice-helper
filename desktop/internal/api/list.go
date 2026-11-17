package api

import (
	"net/http"

	"invoice-helper/desktop/internal/files"
)

type fileListResponse struct {
	Incoming []files.Record       `json:"incoming"`
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

	writeJSON(w, http.StatusOK, fileListResponse{
		Incoming: incoming,
		Outgoing: outgoing,
	})
}
