package discovery

import (
	"fmt"
	"net"
	"strconv"

	"github.com/grandcat/zeroconf"
)

const (
	Instance = "invoice-helper-desktop"
	// 必须是标准 HTTP 服务类型 _http._tcp，否则小程序 wx.startLocalServiceDiscovery
	// 按 _http._tcp. 搜索时匹配不上，永远发现不了这台电脑。
	Service  = "_http._tcp"
	Domain   = "local."
	Version  = "1.0.0"
)

func Start(addr string) (*zeroconf.Server, error) {
	port, err := parsePort(addr)
	if err != nil {
		return nil, err
	}

	txt := []string{"app=攒票小匣", "version=" + Version}
	server, err := zeroconf.Register(Instance, Service, Domain, port, txt, nil)
	if err != nil {
		return nil, fmt.Errorf("注册局域网发现服务失败: %w", err)
	}
	return server, nil
}

func parsePort(addr string) (int, error) {
	_, text, err := net.SplitHostPort(addr)
	if err != nil || text == "" {
		text = "8765"
	}
	port, err := strconv.Atoi(text)
	if err != nil || port < 1 || port > 65535 {
		return 0, fmt.Errorf("监听端口无效: %s", addr)
	}
	return port, nil
}
