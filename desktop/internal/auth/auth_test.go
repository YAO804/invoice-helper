package auth

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSessionVerify(t *testing.T) {
	token := Issue("123456", time.Hour)
	if !Verify(token, "123456") {
		t.Fatal("正确 PIN 应验签通过")
	}
	if Verify(token, "654321") {
		t.Fatal("改 PIN 后旧会话必须失效")
	}
}

func TestSessionExpired(t *testing.T) {
	token := Issue("123456", -time.Hour)
	if Verify(token, "123456") {
		t.Fatal("过期会话必须失效")
	}
}

func TestSessionTampered(t *testing.T) {
	token := Issue("123456", time.Hour)
	if Verify(token+"x", "123456") {
		t.Fatal("篡改的 token 必须失效")
	}
	if Verify("bad.token.here", "123456") {
		t.Fatal("畸形 token 必须失效")
	}
}

func TestChallengeOneTime(t *testing.T) {
	c := NewChallenges()
	code := c.Create()
	if code == "" {
		t.Fatal("应生成挑战码")
	}
	if c.Consume(code) {
		t.Fatal("未确认的码不能换会话")
	}
	c.Confirm(code)
	if !c.Consume(code) {
		t.Fatal("已确认的码应能换会话")
	}
	if c.Consume(code) {
		t.Fatal("一个码只能用一次")
	}
	if c.Confirm(code) {
		t.Fatal("消费后的码不能再被确认")
	}
}

func TestPinStorePersistAndChange(t *testing.T) {
	dir := t.TempDir()
	s, err := New(dir, "123456")
	if err != nil {
		t.Fatal(err)
	}
	if !s.Check("123456") {
		t.Fatal("初始值应生效")
	}
	if err := s.Change("0000", "8888"); err == nil {
		t.Fatal("旧 PIN 错误应拒绝改密")
	}
	if err := s.Change("123456", "88"); err == nil {
		t.Fatal("过短 PIN 应拒绝")
	}
	if err := s.Change("123456", "888888"); err != nil {
		t.Fatal(err)
	}

	// 重启后以文件为准，忽略传入的初始值
	s2, err := New(dir, "123456")
	if err != nil {
		t.Fatal(err)
	}
	if !s2.Check("888888") || s2.Check("123456") {
		t.Fatal("改过的 PIN 应持久生效")
	}

	// 改 PIN 后旧会话失效
	old := Issue("123456", time.Hour)
	if Verify(old, s2.Current()) {
		t.Fatal("改 PIN 后旧会话必须失效")
	}
}

func TestPinFileLocation(t *testing.T) {
	dir := t.TempDir()
	if _, err := New(dir, "123456"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "pin.json")); err != nil {
		t.Fatal("PIN 应写入数据目录")
	}
}
