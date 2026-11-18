package api

import (
	"net/url"
	"strings"
	"testing"
)

func TestConnectCode(t *testing.T) {
	code := ConnectCode("http://192.168.1.20:8765")
	want := "invoice-helper://connect?base=http%3A%2F%2F192.168.1.20%3A8765"
	if code != want {
		t.Fatalf("连接串格式错误: %s", code)
	}

	// 小程序端按 ?base= 取值再解码，这里验证解码后能拿回原地址
	raw := strings.TrimPrefix(code, connectScheme+"?base=")
	decoded, err := url.QueryUnescape(raw)
	if err != nil {
		t.Fatal(err)
	}
	if decoded != "http://192.168.1.20:8765" {
		t.Fatalf("连接串无法还原地址: %s", decoded)
	}

	if ConnectCode("") != "" {
		t.Fatal("没有可用地址时不应生成连接串")
	}
}
