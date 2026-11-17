package main

import (
	"log"
	"net/http"

	"invoice-helper/desktop/internal/api"
	"invoice-helper/desktop/internal/config"
	"invoice-helper/desktop/internal/discovery"
)

func main() {
	cfg := config.Load()

	handler, err := api.NewServer(cfg)
	if err != nil {
		log.Fatal("初始化桌面端服务失败: ", err)
	}

	log.Printf("桌面端已启动: http://0.0.0.0%s", cfg.Addr)
	for _, url := range api.LANURLsFromAddr(cfg.Addr) {
		log.Printf("手机访问: %s", url)
	}
	log.Printf("数据目录: %s", cfg.DataDir)

	server, err := discovery.Start(cfg.Addr)
	if err != nil {
		log.Printf("局域网自动发现不可用: %v", err)
	} else {
		defer server.Shutdown()
		log.Printf("局域网自动发现已开启: %s", discovery.Instance)
	}

	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}
