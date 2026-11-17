package api

import "net/http"

func (d *deps) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"name":    "invoice-helper-desktop",
		"version": serviceVersion,
	})
}
