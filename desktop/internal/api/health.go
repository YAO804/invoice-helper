package api

import "net/http"

func health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"name":    "invoice-helper-desktop",
		"version": "0.1.0",
	})
}
