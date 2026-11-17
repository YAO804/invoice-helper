const discover = require('./discover')

const BASE_KEY = 'desktop_base_url'
const DEVICE_KEY = 'desktop_device_id'
const AUTO_KEY = 'desktop_auto_try_at'
const APP_VERSION = '1.0.0'
const HEARTBEAT_MS = 20000
const AUTO_GAP_MS = 10 * 60 * 1000

let timer = null

function normalizeBase(value) {
  let url = String(value || '').trim()
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url
  return url.replace(/\/+$/, '')
}

function getBase() {
  try {
    return normalizeBase(wx.getStorageSync(BASE_KEY))
  } catch (e) {
    return ''
  }
}

function setBase(value) {
  const url = normalizeBase(value)
  wx.setStorageSync(BASE_KEY, url)
  if (!url) stopAutoHeartbeat()
  return url
}

function deviceId() {
  let id = ''
  try {
    id = wx.getStorageSync(DEVICE_KEY)
  } catch (e) {
    id = ''
  }
  if (!id) {
    id = 'mp-' + Date.now() + '-' + Math.floor(Math.random() * 100000)
    wx.setStorageSync(DEVICE_KEY, id)
  }
  return id
}

function heartbeat() {
  const base = getBase()
  if (!base) return Promise.resolve({ skipped: true })

  return new Promise(function (resolve, reject) {
    wx.request({
      url: base + '/api/devices/heartbeat',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: {
        device_id: deviceId(),
        name: '攒票小匣小程序',
        version: APP_VERSION
      },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data)
        reject(new Error('HTTP ' + res.statusCode))
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '连接失败'))
      }
    })
  })
}

function postJSON(path, data) {
  const base = getBase()
  if (!base) return Promise.reject(new Error('未配置桌面端地址'))

  return new Promise(function (resolve, reject) {
    wx.request({
      url: base + path,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: data,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data)
        reject(new Error('HTTP ' + res.statusCode))
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '连接失败'))
      }
    })
  })
}

function checkInvoiceNumbers(numbers) {
  return postJSON('/api/invoices/check', { numbers: numbers })
}

function sendInvoices(invoices) {
  return postJSON('/api/invoices', {
    device_id: deviceId(),
    invoices: invoices
  })
}

function shouldAutoConnect() {
  if (getBase()) return false
  let last = 0
  try {
    last = Number(wx.getStorageSync(AUTO_KEY)) || 0
  } catch (e) {
    last = 0
  }
  return Date.now() - last > AUTO_GAP_MS
}

function autoConnect(options) {
  try {
    wx.setStorageSync(AUTO_KEY, Date.now())
  } catch (e) {
    // 存储不可用时仍允许本次搜索
  }
  return discover.scan(options).then(function (url) {
    setBase(url)
    startAutoHeartbeat()
    return url
  })
}

function startAutoHeartbeat() {
  if (timer || !getBase()) return
  heartbeat().catch(function () {})
  timer = setInterval(function () {
    if (!getBase()) return stopAutoHeartbeat()
    heartbeat().catch(function () {})
  }, HEARTBEAT_MS)
}

function stopAutoHeartbeat() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

module.exports = {
  normalizeBase: normalizeBase,
  getBase: getBase,
  setBase: setBase,
  deviceId: deviceId,
  heartbeat: heartbeat,
  checkInvoiceNumbers: checkInvoiceNumbers,
  sendInvoices: sendInvoices,
  shouldAutoConnect: shouldAutoConnect,
  autoConnect: autoConnect,
  startAutoHeartbeat: startAutoHeartbeat,
  stopAutoHeartbeat: stopAutoHeartbeat
}
