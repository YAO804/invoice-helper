package discovery

import "testing"

// 小程序按 _http._tcp. 搜索，服务名少写 _tcp 会导致两端永远匹配不上。
func TestServiceTypeMatchesMiniProgram(t *testing.T) {
	if Service != "_http._tcp" {
		t.Fatalf("服务类型必须是 _http._tcp，实际为 %q", Service)
	}
}

func TestParsePort(t *testing.T) {
	port, err := parsePort(":9000")
	if err != nil || port != 9000 {
		t.Fatalf("端口解析错误: %d %v", port, err)
	}
	port, err = parsePort("127.0.0.1:8765")
	if err != nil || port != 8765 {
		t.Fatalf("带 IP 端口解析错误: %d %v", port, err)
	}
	port, err = parsePort("bad")
	if err != nil || port != 8765 {
		t.Fatalf("空端口应回退默认值: %d %v", port, err)
	}
	if _, err := parsePort(":99999"); err == nil {
		t.Fatal("越界端口应报错")
	}
}
