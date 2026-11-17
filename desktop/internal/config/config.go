package config

import (
	"flag"
	"os"
	"path/filepath"
)

const (
	defaultAddr    = ":8765"
	defaultDataDir = "data"
)

type Config struct {
	Addr    string
	DataDir string
}

func Load() Config {
	addr := flag.String("addr", env("INVOICE_ADDR", defaultAddr), "监听地址，例如 :8765")
	dataDir := flag.String("data", env("INVOICE_DATA_DIR", defaultDataDir), "运行时数据目录")
	flag.Parse()

	return Config{
		Addr:    fallback(*addr, defaultAddr),
		DataDir: filepath.Clean(fallback(*dataDir, defaultDataDir)),
	}
}

func env(key string, fallbackValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallbackValue
}

func fallback(value string, fallbackValue string) string {
	if value == "" {
		return fallbackValue
	}
	return value
}
