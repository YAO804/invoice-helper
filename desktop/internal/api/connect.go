package api

import (
	"net/http"
	"net/url"

	qrcode "github.com/skip2/go-qrcode"
)

// connectScheme 是小程序识别的连接串前缀，后面跟 URL 编码后的电脑地址。
// 用自定义 scheme 而不是普通 URL，避免用户扫到别的网址时被误当成本机地址。
const connectScheme = "invoice-helper://connect"

// ConnectCode 把电脑地址包成扫码用的连接串。
func ConnectCode(base string) string {
	if base == "" {
		return ""
	}
	return connectScheme + "?base=" + url.QueryEscape(base)
}

// primaryBaseURL 取网页上展示的首选地址：优选 WLAN/以太网，过滤虚拟网卡。
func (d *deps) primaryBaseURL() string {
	urls := LANURLsFromAddr(d.addr)
	if len(urls) == 0 {
		return ""
	}
	return urls[0]
}

// connectQR 输出连接二维码 PNG，供手机扫码后直连本机。
func (d *deps) connectQR(w http.ResponseWriter, r *http.Request) {
	code := ConnectCode(d.primaryBaseURL())
	if code == "" {
		http.Error(w, "未检测到局域网地址，请先连上 WiFi 或网线", http.StatusServiceUnavailable)
		return
	}

	png, err := qrcode.Encode(code, qrcode.Medium, 320)
	if err != nil {
		http.Error(w, "生成二维码失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(png)
}
