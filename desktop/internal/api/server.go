package api

import (
	"net/http"
	"time"

	"invoice-helper/desktop/internal/config"
	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/ledger"
	"invoice-helper/desktop/internal/registry"
)

func NewServer(cfg config.Config) (http.Handler, error) {
	store, err := files.New(cfg.DataDir)
	if err != nil {
		return nil, err
	}

	invoiceLedger, err := ledger.New(cfg.DataDir)
	if err != nil {
		return nil, err
	}

	deviceRegistry, err := registry.New(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	return NewHandler(cfg.Addr, store, invoiceLedger, deviceRegistry), nil
}

func NewHandler(addr string, store *files.Store, invoiceLedger *ledger.Store, deviceRegistry *registry.Registry) http.Handler {
	d := &deps{
		store:     store,
		ledger:    invoiceLedger,
		registry:  deviceRegistry,
		addr:      addr,
		startedAt: time.Now(),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", d.health)
	mux.HandleFunc("GET /api/status", d.status)
	mux.HandleFunc("POST /api/devices/heartbeat", d.heartbeat)
	mux.HandleFunc("POST /api/files/upload", d.uploadFile)
	mux.HandleFunc("GET /api/files", d.listFiles)
	mux.HandleFunc("GET /api/invoices", d.listInvoices)
	mux.HandleFunc("POST /api/invoices", d.receiveInvoices)
	mux.HandleFunc("POST /api/invoices/check", d.checkInvoices)
	mux.HandleFunc("POST /api/invoices/import", d.importInvoices)
	mux.HandleFunc("GET /api/invoices/export", d.exportInvoices)
	mux.HandleFunc("DELETE /api/invoices", d.deleteInvoices)
	mux.HandleFunc("DELETE /api/incoming/{id}", d.deleteIncoming)
	mux.HandleFunc("DELETE /api/outgoing/{name}", d.deleteOutgoing)
	mux.HandleFunc("GET /api/incoming/{id}/download", d.downloadIncoming)
	mux.HandleFunc("GET /api/outgoing/{name}/download", d.downloadOutgoing)
	mux.Handle("/", staticFiles())

	return mux
}
