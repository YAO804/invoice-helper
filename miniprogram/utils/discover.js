const mdnsScan = require('./mdns-scan')

const SERVICE_TYPE = '_http._tcp.'
const MATCH = 'invoice-helper'
const CONNECT_SCHEME = 'invoice-helper://connect'

const scanner = mdnsScan.createScanner({
  serviceType: SERVICE_TYPE,
  toUrl: candidate,
  resolveUrls: function (urls) { return firstWorking(urls) }
})

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

/**
 * 微信 mDNS 只回一个 ip；电脑若有多块网卡，广播里可能夹带 169.254 链路本地地址。
 * 这里先把不可能在手机局域网里访问到的地址挡掉，避免探活一个必失败的地址后
 * 又把「没找到电脑」和「找到了但连不上」混成同一句提示。
 */
function validIP(ip) {
  if (typeof ip !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false
  const parts = ip.split('.').map(Number)
  if (parts.some(function (n) { return n < 0 || n > 255 })) return false
  if (parts[0] === 0 || parts[0] === 127) return false          // 未指定 / 回环
  if (parts[0] === 169 && parts[1] === 254) return false       // APIPA 链路本地
  return true
}

function candidate(res) {
  const name = res && res.serviceName ? res.serviceName : ''
  if (name.indexOf(MATCH) < 0) return ''
  if (!res.ip || !res.port) return ''
  if (!validIP(res.ip)) return ''
  return 'http://' + res.ip + ':' + res.port
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

function scan(options) {
  if (!supported()) {
    return Promise.reject(new Error('这台设备不支持自动发现，请扫码连接或手动填写电脑地址'))
  }
  return scanner.scan(options)
}

function cancel() {
  scanner.cancel()
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

/**
 * 只拿扫码原始串；设置页靠它区分「连接码」和「登录码」两种二维码。
 *
 * 用户按返回键取消时 errMsg 是 "scanCode:fail cancel"，这不是错误：
 * 用 cancelled 标记交给调用方静默退出，别弹「扫码失败」吓人。
 */
function scanRaw() {
  return new Promise(function (resolve, reject) {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: function (res) { resolve((res && res.result) || '') },
      fail: function (err) {
        const reason = (err && err.errMsg) || ''
        if (reason.indexOf('cancel') >= 0) {
          const cancelled = new Error('已取消扫码')
          cancelled.cancelled = true
          reject(cancelled)
          return
        }
        reject(new Error('扫码失败：' + (reason || '未知原因')))
      }
    })
  })
}

/** 扫电脑上的二维码连过去：先解析，再探一次 /api/health，通了才用 */
function scanConnectCode() {
  return scanRaw().then(function (raw) {
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
  cancel: cancel,
  parseConnectCode: parseConnectCode,
  validIP: validIP,
  candidate: candidate,
  verifyUrl: verify,
  scanRaw: scanRaw,
  scanConnectCode: scanConnectCode
}
