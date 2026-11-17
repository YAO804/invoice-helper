package discovery

import "testing"

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
