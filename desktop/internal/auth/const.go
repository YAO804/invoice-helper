package auth

import "time"

// DefaultPIN 是首次启动的初始口令。config/环境变量/启动参数可覆盖；
// 一旦小程序改过 PIN，运行期就以 data 目录里的 pin.json 为准。
const DefaultPIN = "123456"

// SessionTTL 是网页会话有效期。本机自用、信任浏览器，设长一些省得天天扫码。
const SessionTTL = 30 * 24 * time.Hour

// ChallengeTTL 是扫码登录一次性码的有效期，短一些以缩小被抢用的窗口。
const ChallengeTTL = 5 * time.Minute
