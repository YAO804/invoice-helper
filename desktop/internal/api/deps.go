package api

import (
	"time"

	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/ledger"
	"invoice-helper/desktop/internal/registry"
)

const (
	serviceVersion      = "0.2.0"
	onlineWindowSeconds = 45
)

type deps struct {
	store     *files.Store
	ledger    *ledger.Store
	registry  *registry.Registry
	addr      string
	startedAt time.Time
}
