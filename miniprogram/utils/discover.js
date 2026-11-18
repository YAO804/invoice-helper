const SERVICE_TYPE = '_http._tcp.'
const MATCH = 'invoice-helper'
const CONNECT_SCHEME = 'invoice-helper://connect'
const DEFAULT_SETTLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 28000

// mDNS 扫描是微信全局单例，同一时间只能跑一个任务。
// 模块级互斥，避免 onLaunch 自动连接与手动点击重复 start（否则报 scan task already exist）。
let activeScan = null

function platform() {
  try {
    return wx.getSystemInfoSync().platform || ''
  } catch (e) {
    return ''
  }
}

function supported() {
  return typeof wx.startLocalServiceDiscovery === 'function' && platform() !== 'ios'
}

function candidate(res) {
  const name = res && res.serviceName ? res.serviceName : ''
  if (name.indexOf(MATCH) < 0) return ''
  if (!res.ip || !res.port) return ''
  return 'http://' + res.ip + ':' + res.port
}

function unique(list) {
  const result = []
  list.forEach(function (url) {
    if (result.indexOf(url) < 0) result.push(url)
  })
  return result
}

function verify(url) {
  return new Promise(function (resolve) {
    wx.request({
      url: url + '/api/health',
      method: 'GET',
      timeout: 2000,
      success: function (res) {
        resolve(res.statusCode === 200 && res.data && res.data.ok ? url : '')
      },
      fail: function () { resolve('') }
    })
  })
}

function firstWorking(list, index) {
  const i = index || 0
  if (i >= list.length) return Promise.resolve('')
  return verify(list[i]).then(function (url) {
    return url || firstWorking(list, i + 1)
  })
}

function doScan(options) {
  const settings = options || {}
  const settleMs = settings.settleMs || DEFAULT_SETTLE_MS
  const timeoutMs = settings.timeoutMs || DEFAULT_TIMEOUT_MS

  return new Promise(function (resolve, reject) {
    const found = []
    let settleTimer = null
    let timeoutTimer = null
    let finished = false
    let retried = false
    let retrying = false

    function onFound(res) {
      const url = candidate(res)
      if (!url || finished) return
      found.push(url)
      if (!settleTimer) settleTimer = setTimeout(stop, settleMs)
    }

    function onStop() {
      if (finished) return
      // start 曾因「已有任务」失败：这次 stop 是为清掉遗留任务，停完再启动自己
      if (retrying) {
        retrying = false
        startScan()
        return
      }
      firstWorking(unique(found)).then(function (url) {
        finish(url, '没有找到可连接的电脑')
      })
    }

    function stop() {
      if (finished) return
      try {
        wx.stopLocalServiceDiscovery()
      } catch (e) {
        onStop()
      }
    }

    function finish(url, message) {
      if (finished) return
      finished = true
      clearTimeout(settleTimer)
      clearTimeout(timeoutTimer)
      if (typeof wx.offLocalServiceFound === 'function') wx.offLocalServiceFound(onFound)
      if (typeof wx.offLocalServiceDiscoveryStop === 'function') wx.offLocalServiceDiscoveryStop(onStop)
      if (url) resolve(url)
      else reject(new Error(message))
    }

    function startScan() {
      wx.startLocalServiceDiscovery({
        serviceType: SERVICE_TYPE,
        fail: function (err) {
          const msg = (err && err.errMsg) || '启动局域网搜索失败'
          // 上一次扫描没清干净：先 stop 再重试一次，避免把内部错误抛给用户
          if (msg.indexOf('scan task already exist') >= 0 && !retried) {
            retried = true
            retrying = true
            try {
              wx.stopLocalServiceDiscovery()
            } catch (e) {
              retrying = false
              finish('', msg)
            }
            return
          }
          finish('', msg)
        }
      })
    }

    if (typeof wx.onLocalServiceFound === 'function') wx.onLocalServiceFound(onFound)
    if (typeof wx.onLocalServiceDiscoveryStop === 'function') wx.onLocalServiceDiscoveryStop(onStop)
    timeoutTimer = setTimeout(stop, timeoutMs)
    startScan()
  })
}

function scan(options) {
  if (!supported()) {
    return Promise.reject(new Error('这台设备不支持自动发现，请扫码连接或手动填写电脑地址'))
  }
  // 已有扫描在跑就复用，避免重复 start 触发 scan task already exist
  if (activeScan) return activeScan
  const current = doScan(options).then(
    function (url) { if (activeScan === current) activeScan = null; return url },
    function (err) { if (activeScan === current) activeScan = null; throw err }
  )
  activeScan = current
  return current
}

/**
 * 解析电脑端网页上的连接二维码。
 *
 * 约定格式 invoice-helper://connect?base=<urlencode 后的 http 地址>；
 * 也接受直接是 http 地址的二维码，方便用户自己生成。
 * 不是这两种就返回 ''，由调用方提示，不要瞎猜。
 */
function parseConnectCode(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text.replace(/\/+$/, '')
  if (text.indexOf(CONNECT_SCHEME) !== 0) return ''

  const start = text.indexOf('?')
  const query = start >= 0 ? text.slice(start + 1) : ''
  const parts = query.split('&')
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq < 0 || parts[i].slice(0, eq) !== 'base') continue
    let base = ''
    try {
      base = decodeURIComponent(parts[i].slice(eq + 1))
    } catch (e) {
      return ''
    }
    return /^https?:\/\//i.test(base) ? base.replace(/\/+$/, '') : ''
  }
  return ''
}

/** 扫电脑上的二维码连过去：先解析，再探一次 /api/health，通了才用 */
function scanConnectCode() {
  return new Promise(function (resolve, reject) {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: function (res) { resolve((res && res.result) || '') },
      fail: function (err) { reject(new Error('扫码失败：' + ((err && err.errMsg) || ''))) }
    })
  }).then(function (raw) {
    const url = parseConnectCode(raw)
    if (!url) return Promise.reject(new Error('这不是攒票小匣的连接二维码'))
    return verify(url).then(function (ok) {
      if (!ok) return Promise.reject(new Error('扫到地址了但电脑没响应，确认在同一个 WiFi'))
      return url
    })
  })
}

module.exports = {
  supported: supported,
  scan: scan,
  parseConnectCode: parseConnectCode,
  scanConnectCode: scanConnectCode
}
