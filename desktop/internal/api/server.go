package api

import (
	"net/http"

	"invoice-helper/desktop/internal/config"
	"invoice-helper/desktop/internal/files"
)

func NewServer(cfg config.Config) (http.Handler, error) {
	store, err := files.New(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	return NewHandler(store), nil
}

func NewHandler(store *files.Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", health)
	mux.HandleFunc("POST /api/files/upload", uploadFile(store))
	mux.HandleFunc("GET /api/files", listFiles(store))
	mux.HandleFunc("GET /api/incoming/{id}/download", downloadIncoming(store))
	mux.HandleFunc("GET /api/outgoing/{name}/download", downloadOutgoing(store))
	mux.Handle("/", staticFiles())

	return mux
}
