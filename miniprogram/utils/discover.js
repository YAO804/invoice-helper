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

function candidate(res) {
  const name = res && res.serviceName ? res.serviceName : ''
  if (name.indexOf(MATCH) < 0) return ''
  if (!res.ip || !res.port) return ''
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
  cancel: cancel,
  parseConnectCode: parseConnectCode,
  scanConnectCode: scanConnectCode
}
