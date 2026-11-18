package config

import (
	"flag"
	"os"
	"path/filepath"
	"strconv"
)

const (
	defaultAddr     = ":8765"
	defaultDataDir  = "data"
	defaultKeepDays = 30
	defaultPIN      = "123456"
)

type Config struct {
	Addr     string
	DataDir  string
	KeepDays int
	PIN      string
}

func Load() Config {
	addr := flag.String("addr", env("INVOICE_ADDR", defaultAddr), "监听地址，例如 :8765")
	dataDir := flag.String("data", env("INVOICE_DATA_DIR", defaultDataDir), "运行时数据目录")
	keepDays := flag.Int("keep-days", envInt("INVOICE_KEEP_DAYS", defaultKeepDays),
		"接收文件保留天数，超过后自动清理；0 表示不自动清理")
	pin := flag.String("pin", env("INVOICE_PIN", defaultPIN), "登录 PIN，首次启动写入数据目录，之后以数据目录为准")
	flag.Parse()

	return Config{
		Addr:     fallback(*addr, defaultAddr),
		DataDir:  filepath.Clean(fallback(*dataDir, defaultDataDir)),
		KeepDays: *keepDays,
		PIN:      fallback(*pin, defaultPIN),
	}
}

func env(key string, fallbackValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallbackValue
}

func envInt(key string, fallbackValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallbackValue
	}
	number, err := strconv.Atoi(value)
	if err != nil {
		return fallbackValue
	}
	return number
}

func fallback(value string, fallbackValue string) string {
	if value == "" {
		return fallbackValue
	}
	return value
}
