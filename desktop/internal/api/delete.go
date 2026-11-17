package api

import "net/http"

func (d *deps) deleteIncoming(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	record, ok, err := d.store.FindRecord(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "读取上传记录失败: "+err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "上传记录不存在")
		return
	}

	if _, err := d.store.DeleteIncoming(id); err != nil {
		writeError(w, http.StatusInternalServerError, "删除文件失败: "+err.Error())
		return
	}
	_ = d.registry.MarkEvent("delete", "删除接收文件 "+record.Name, "", 0)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d *deps) deleteOutgoing(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	ok, err := d.store.DeleteOutgoing(name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "删除文件失败: "+err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "待取文件不存在")
		return
	}

	_ = d.registry.MarkEvent("delete", "删除待取文件 "+name, "", 0)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
