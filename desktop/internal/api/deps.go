package api

import (
	"time"

	"invoice-helper/desktop/internal/files"
	"invoice-helper/desktop/internal/ledger"
	"invoice-helper/desktop/internal/registry"
)

const (
	// serviceVersion 会在控制台「服务状态」里显示。
	// 用户报「界面没变化」时先看这里：版本没变就是还在跑旧进程，不是代码问题。
	serviceVersion      = "0.5.0"
	onlineWindowSeconds = 45
)

type deps struct {
	store     *files.Store
	ledger    *ledger.Store
	registry  *registry.Registry
	addr      string
	startedAt time.Time
}
