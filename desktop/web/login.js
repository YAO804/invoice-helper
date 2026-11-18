/**
 * 网页登录门控。
 *
 * 服务端所有 /api 接口（除 health 和登录接口）都要求会话。
 * 会话是 HttpOnly cookie，JS 读不到，所以用 GET /api/status 探活来判断是否已登录：
 * 200 = 已登录，401 = 需要扫码。登录后再通知两个页面模块开始拉数据。
 */

const LOGIN_POLL_MS = 1500

function $(id) { return document.getElementById(id) }

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
  $('loginQr').src = qrURL(code)
  $('loginMask').hidden = false
}

function hideLogin() {
  $('loginMask').hidden = true
}

function setLoginTip(text) {
  $('loginTip').textContent = text
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
  const button = $('loginRefreshBtn')
  if (button) button.addEventListener('click', refreshLoginCode)
}

document.addEventListener('DOMContentLoaded', function () {
  bindLoginEvents()
  bootLogin()
})
