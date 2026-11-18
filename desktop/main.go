package main

import (
	"log"
	"net/http"
	"time"

	"invoice-helper/desktop/internal/api"
	"invoice-helper/desktop/internal/config"
	"invoice-helper/desktop/internal/discovery"
	"invoice-helper/desktop/internal/files"
)

// retentionInterval 是后台清理的检查间隔。保留期以天为单位，6 小时足够及时。
const retentionInterval = 6 * time.Hour

func main() {
	cfg := config.Load()

	handler, fileStore, err := api.NewServer(cfg)
	if err != nil {
		log.Fatal("初始化桌面端服务失败: ", err)
	}

	log.Printf("桌面端已启动: http://0.0.0.0%s", cfg.Addr)
	for _, url := range api.LANURLsFromAddr(cfg.Addr) {
		log.Printf("手机访问: %s", url)
	}
	log.Printf("数据目录: %s", cfg.DataDir)
	log.Printf("登录已启用：网页首次打开需用小程序扫码授权；PIN 存于 %s", cfg.DataDir+"/pin.json")

	startRetention(fileStore, cfg.KeepDays)

	server, err := discovery.Start(cfg.Addr)
	if err != nil {
		log.Printf("局域网自动发现不可用: %v", err)
	} else {
		defer server.Shutdown()
		log.Printf("局域网自动发现已开启: %s", discovery.Instance)
	}

	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}

// startRetention 启动文件保留期清理：启动时先跑一次，之后定期检查。
//
// 两个目录都清：incoming 是小程序传上来的副本，outgoing 是给小程序取走的副本，
// 两边的源文件都还在各自原处，所以这里的删除不会让用户失去唯一一份。
// keepDays <= 0 表示关闭自动清理，文件只能由用户在页面上手动删。
func startRetention(store *files.Store, keepDays int) {
	if keepDays <= 0 {
		log.Printf("文件自动清理已关闭")
		return
	}

	purge := func() {
		removedIncoming, err := store.PurgeOlderThan(keepDays)
		if err != nil {
			log.Printf("清理超期接收文件失败: %v", err)
		} else if removedIncoming > 0 {
			log.Printf("已清理 %d 个超过 %d 天的接收文件", removedIncoming, keepDays)
		}

		removedOutgoing, err := store.PurgeOutgoingOlderThan(keepDays)
		if err != nil {
			log.Printf("清理超期待取文件失败: %v", err)
		} else if removedOutgoing > 0 {
			log.Printf("已清理 %d 个超过 %d 天的待取文件", removedOutgoing, keepDays)
		}
	}

	purge()
	log.Printf("接收与待取文件均保留 %d 天，每 %v 检查一次", keepDays, retentionInterval)

	go func() {
		ticker := time.NewTicker(retentionInterval)
		defer ticker.Stop()
		for range ticker.C {
			purge()
		}
	}()
}
