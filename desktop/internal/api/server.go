package api

import (
	"net/http"
	"time"

	"invoice-helper/desktop/internal/config"
	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/ledger"
	"invoice-helper/desktop/internal/registry"
)

// NewServer 组装真实运行所需的服务，并把 files.Store 交回给调用方，
// 以便 main 启动接收文件保留期清理（清理是后台任务，不该藏在构造函数里）。
func NewServer(cfg config.Config) (http.Handler, *files.Store, error) {
	store, err := files.New(cfg.DataDir)
	if err != nil {
		return nil, nil, err
	}

	invoiceLedger, err := ledger.New(cfg.DataDir)
	if err != nil {
		return nil, nil, err
	}

	deviceRegistry, err := registry.New(cfg.DataDir)
	if err != nil {
		return nil, nil, err
	}
	return NewHandler(cfg.Addr, store, invoiceLedger, deviceRegistry), store, nil
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
	mux.HandleFunc("GET /api/connect-qr.png", d.connectQR)
	mux.HandleFunc("POST /api/devices/heartbeat", d.heartbeat)
	mux.HandleFunc("POST /api/files/upload", d.uploadFile)
	mux.HandleFunc("POST /api/files/outgoing", d.putOutgoing)
	mux.HandleFunc("GET /api/files", d.listFiles)
	mux.HandleFunc("GET /api/invoices", d.listInvoices)
	mux.HandleFunc("POST /api/invoices", d.receiveInvoices)
	mux.HandleFunc("POST /api/invoices/manual", d.createInvoice)
	mux.HandleFunc("POST /api/invoices/check", d.checkInvoices)
	mux.HandleFunc("POST /api/invoices/purge", d.purgeInvoices)
	mux.HandleFunc("PUT /api/invoices/{id}", d.updateInvoice)
	mux.HandleFunc("POST /api/invoices/import", d.importInvoices)
	mux.HandleFunc("GET /api/invoices/export", d.exportInvoices)
	mux.HandleFunc("DELETE /api/invoices", d.deleteInvoices)
	mux.HandleFunc("DELETE /api/incoming/{id}", d.deleteIncoming)
	mux.HandleFunc("DELETE /api/incoming", d.deleteIncomingBatch)
	mux.HandleFunc("POST /api/incoming/purge", d.purgeIncoming)
	mux.HandleFunc("DELETE /api/outgoing/{name}", d.deleteOutgoing)
	mux.HandleFunc("DELETE /api/outgoing", d.deleteOutgoingBatch)
	mux.HandleFunc("POST /api/outgoing/purge", d.purgeOutgoing)
	mux.HandleFunc("GET /api/incoming/{id}/download", d.downloadIncoming)
	mux.HandleFunc("GET /api/incoming/{id}/view", d.viewIncoming)
	mux.HandleFunc("GET /api/outgoing/{name}/download", d.downloadOutgoing)
	mux.Handle("/", staticFiles())

	return mux
}
