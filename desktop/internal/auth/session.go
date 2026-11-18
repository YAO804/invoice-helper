package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"time"
)

const sessionVersion = "v1"

// sessionKey 从 PIN 派生签名密钥。PIN 位数少，直接当 HMAC key 太短，
// 先过一层 SHA-256 让密钥有足够长度。
func sessionKey(pin string) []byte {
	sum := sha256.Sum256([]byte("invoice-helper/session/" + pin))
	return sum[:]
}

func sign(expiry string, pin string) string {
	mac := hmac.New(sha256.New, sessionKey(pin))
	_, _ = mac.Write([]byte(sessionVersion + "." + expiry))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Issue 签发一个会话 token：版本号.过期时间戳.签名。
// 签名绑定当前 PIN，改 PIN 后旧 token 全部失效，无需维护会话黑名单。
func Issue(pin string, ttl time.Duration) string {
	expiry := strconv.FormatInt(time.Now().Add(ttl).Unix(), 10)
	return sessionVersion + "." + expiry + "." + sign(expiry, pin)
}

// Verify 校验 token 未过期且签名匹配当前 PIN。
func Verify(token string, pin string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != sessionVersion {
		return false
	}
	expiry, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().Unix() > expiry {
		return false
	}
	want := sign(parts[1], pin)
	return hmac.Equal([]byte(parts[2]), []byte(want))
}
