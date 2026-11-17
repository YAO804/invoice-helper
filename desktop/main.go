package main

import (
	"log"
	"net/http"

	"invoice-helper/desktop/internal/api"
	"invoice-helper/desktop/internal/config"
)

func main() {
	cfg := config.Load()

	handler, err := api.NewServer(cfg)
	if err != nil {
		log.Fatal("初始化桌面端服务失败: ", err)
	}

	log.Printf("桌面端已启动: http://0.0.0.0%s", cfg.Addr)
	log.Printf("数据目录: %s", cfg.DataDir)
	log.Fatal(http.ListenAndServe(cfg.Addr, handler))
}
