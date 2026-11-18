/**
 * 网页登录门控。
 *
 * 服务端所有 /api 接口（除 health 和登录接口）都要求会话。
 * 会话是 HttpOnly cookie，JS 读不到，所以用 GET /api/status 探活来判断是否已登录：
 * 200 = 已登录，401 = 需要扫码。登录后再通知两个页面模块开始拉数据。
 */

const LOGIN_POLL_MS = 1500

// $ 由 render.js 统一定义。这里也曾定义过一份，两个经典脚本的顶层
// function/const 冲突会让 render.js 整份加载失败（界面只剩「renderStatus is not defined」）。

async function isLoggedIn() {
  try {
    const res = await fetch('/api/status', { credentials: 'same-origin' })
    return res.ok
  } catch (e) {
    return false
  }
}

async function requestChallenge() {
  const res = await fetch('/api/auth/challenge', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('获取登录码失败')
  const data = await res.json()
  return data.code
}

function qrURL(code) {
  return '/api/auth/qr.png?c=' + encodeURIComponent(code)
}

function showLogin(code) {
  document.getElementById('loginQr').src = qrURL(code)
  document.getElementById('loginMask').hidden = false
}

function hideLogin() {
  document.getElementById('loginMask').hidden = true
}

function setLoginTip(text) {
  document.getElementById('loginTip').textContent = text
}

function startApp() {
  hideLogin()
  if (window.startDesktopApp) window.startDesktopApp()
  if (window.startLedgerApp) window.startLedgerApp()
}

/** 轮询等待小程序扫码确认；确认后服务端会种下会话 cookie。 */
function pollSession(code) {
  return new Promise(function (resolve) {
    const timer = setInterval(async function () {
      try {
        const res = await fetch('/api/auth/session?c=' + encodeURIComponent(code), {
          credentials: 'same-origin'
        })
        if (!res.ok) return
        clearInterval(timer)
        resolve()
      } catch (e) {
        // 网络抖动继续轮询，不打断登录
      }
    }, LOGIN_POLL_MS)
  })
}

async function refreshLoginCode() {
  try {
    const code = await requestChallenge()
    showLogin(code)
    setLoginTip('请用手机小程序扫码授权')
    await pollSession(code)
    startApp()
  } catch (e) {
    setLoginTip(e.message || '登录失败，请点「刷新二维码」重试')
  }
}

async function bootLogin() {
  if (await isLoggedIn()) {
    startApp()
  } else {
    await refreshLoginCode()
  }
}

function bindLoginEvents() {
  const button = document.getElementById('loginRefreshBtn')
  if (button) button.addEventListener('click', refreshLoginCode)
}

document.addEventListener('DOMContentLoaded', function () {
  bindLoginEvents()
  bootLogin()
})
