package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// Challenges 保存扫码登录的一次性挑战码。
// 网页请码 → 小程序带 PIN 确认 → 网页凭码换会话，一个码只能用一次。
type Challenges struct {
	mu     sync.Mutex
	items  map[string]bool
	expiry map[string]time.Time
}

func NewChallenges() *Challenges {
	return &Challenges{items: make(map[string]bool), expiry: make(map[string]time.Time)}
}

// Create 生成一个未被确认的挑战码，同时清理过期码。
func (c *Challenges) Create() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return ""
	}
	code := hex.EncodeToString(buf)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.purgeExpiredLocked()
	c.items[code] = false
	c.expiry[code] = time.Now().Add(ChallengeTTL)
	return code
}

// Confirm 把挑战码标记为已确认。返回 false 表示码不存在或已过期。
func (c *Challenges) Confirm(code string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.items[code]; !ok {
		return false
	}
	if time.Now().After(c.expiry[code]) {
		c.removeLocked(code)
		return false
	}
	c.items[code] = true
	return true
}

// Consume 原子地消费一个已确认的码：确认过返回 true 并删除，否则 false。
// 删除发生在校验内部，保证一个码换一次会话。
func (c *Challenges) Consume(code string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	confirmed, ok := c.items[code]
	if !ok || !confirmed {
		return false
	}
	if time.Now().After(c.expiry[code]) {
		c.removeLocked(code)
		return false
	}
	c.removeLocked(code)
	return true
}

func (c *Challenges) removeLocked(code string) {
	delete(c.items, code)
	delete(c.expiry, code)
}

func (c *Challenges) purgeExpiredLocked() {
	now := time.Now()
	for code, deadline := range c.expiry {
		if now.After(deadline) {
			c.removeLocked(code)
		}
	}
}
