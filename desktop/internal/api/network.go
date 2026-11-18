package api

import (
	"net"
	"sort"
	"strconv"
	"strings"
)

type NetworkAddress struct {
	IP        string `json:"ip"`
	URL       string `json:"url"`
	Interface string `json:"interface"`
}

type scoredAddress struct {
	address NetworkAddress
	score   int
}

func LANAddresses(port string) []NetworkAddress {
	result := []NetworkAddress{}
	scored := []scoredAddress{}
	interfaces, err := net.Interfaces()
	if err != nil {
		return result
	}

	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addresses, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, address := range addresses {
			ipNet, ok := address.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipNet.IP.To4()
			if ip == nil || !usableIP(ip) {
				continue
			}
			score := addressScore(iface.Name, ip)
			if score <= 0 {
				continue
			}
			scored = append(scored, scoredAddress{
				address: NetworkAddress{
					IP:        ip.String(),
					URL:       "http://" + net.JoinHostPort(ip.String(), port),
					Interface: iface.Name,
				},
				score: score,
			})
		}
	}

	sort.Slice(scored, func(i int, j int) bool {
		return scored[i].score > scored[j].score
	})
	for _, item := range scored {
		result = append(result, item.address)
	}
	return result
}

// MulticastInterfaces 返回所有已启用且支持组播的网卡。
//
// 注意这里刻意「不过滤」虚拟网卡：zeroconf 用 ifaces 决定在哪些网卡加入 mDNS
// 组播组、收发 224.0.0.251 的公告。实测只给一张有效网卡（单 WLAN）时，Windows
// 上组播收发异常，同一局域网的另一进程搜不到服务；必须保留全部组播网卡，
// 收发行为才与原版 Register(nil) 一致。
// 要控制广播出去的 IP，用 RegisterProxy 的 ips 参数（见 discovery.Start），
// 不要靠裁剪这里的网卡列表。
func MulticastInterfaces() []net.Interface {
	result := []net.Interface{}
	interfaces, err := net.Interfaces()
	if err != nil {
		return result
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagMulticast != 0 {
			result = append(result, iface)
		}
	}
	return result
}

func addressScore(iface string, ip net.IP) int {
	name := strings.ToLower(iface)
	if hasVirtualHint(name) {
		return 0
	}

	score := 1
	if strings.Contains(name, "wlan") || strings.Contains(name, "wi-fi") ||
		strings.Contains(name, "wifi") || strings.Contains(name, "ethernet") ||
		strings.Contains(name, "以太网") {
		score += 100
	}
	if ip.IsPrivate() {
		score += 30
	} else {
		score -= 50
	}
	return score
}

func hasVirtualHint(name string) bool {
	hints := []string{
		"tunnel", "virtual", "veth", "wsl", "docker", "hyper-v",
		"vmware", "virtualbox", "tailscale", "zerotier", "ngrok",
	}
	for _, hint := range hints {
		if strings.Contains(name, hint) {
			return true
		}
	}
	return false
}

func LANURLs(port string) []string {
	addresses := LANAddresses(port)
	urls := []string{}
	for _, address := range addresses {
		urls = append(urls, address.URL)
	}
	return urls
}

func LANURLsFromAddr(addr string) []string {
	return LANURLs(portFromAddr(addr))
}

func portFromAddr(addr string) string {
	_, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		return strconv.Itoa(8765)
	}
	return port
}

func usableIP(ip net.IP) bool {
	return !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast()
}
