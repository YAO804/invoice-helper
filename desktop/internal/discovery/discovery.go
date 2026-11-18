package discovery

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"

	"invoice-helper/desktop/internal/api"
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

	// 只广播网页上也会展示的、真正可用的局域网地址。
	// 不能用 Register(..., nil)：zeroconf 会把所有网卡的地址（含 169.254.x.x、
	// 虚拟网卡）塞进同一条 A 记录；微信 onLocalServiceFound 只回一个 ip，
	// 一旦拿到无效地址，探活失败后就会被误报成「找不到电脑」。
	// 用 RegisterProxy 的 ips 参数精确控制广播的 IP，顺序沿用 LANAddresses 打分。
	addresses := api.LANAddresses(strconv.Itoa(port))
	if len(addresses) == 0 {
		return nil, fmt.Errorf("没有可用的局域网地址，无法开启自动发现")
	}
	ips := make([]string, 0, len(addresses))
	for _, address := range addresses {
		ips = append(ips, address.IP)
	}

	// ifaces 必须保留全部组播网卡：它决定 mDNS 在哪些网卡上收发 224.0.0.251。
	// 只给一张有效网卡会让 Windows 上的组播收发失效，局域网内其他设备搜不到服务。
	ifaces := api.MulticastInterfaces()
	if len(ifaces) == 0 {
		return nil, fmt.Errorf("没有可用的组播网卡，无法开启自动发现")
	}

	host, err := os.Hostname()
	if err != nil || strings.TrimSpace(host) == "" {
		host = Instance
	}
	txt := []string{"app=攒票小匣", "version=" + Version}
	server, err := zeroconf.RegisterProxy(Instance, Service, Domain, port, host, ips, txt, ifaces)
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
