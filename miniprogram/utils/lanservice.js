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

function getJSON(path) {
  const base = getBase()
  if (!base) return Promise.reject(new Error('未配置桌面端地址'))

  return new Promise(function (resolve, reject) {
    wx.request({
      url: base + path,
      method: 'GET',
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

/**
 * 发送前查重：把「代码+号码」一起提交。
 * 老票只给号码会跨代码误判，代码为空时服务端退化为按号码匹配（数电票本来没有代码）。
 */
function checkInvoices(invoices) {
  return postJSON('/api/invoices/check', {
    invoices: (invoices || []).map(function (invoice) {
      return { number: invoice.number || '', code: invoice.code || '' }
    })
  })
}

/** 只要号码时的简写，等价于代码留空。 */
function checkInvoiceNumbers(numbers) {
  return postJSON('/api/invoices/check', { numbers: numbers })
}

function sendInvoices(invoices) {
  return postJSON('/api/invoices', {
    device_id: deviceId(),
    invoices: invoices
  })
}

/** 电脑端已收到的文件列表 */
function listFiles() {
  return getJSON('/api/files')
}

/**
 * 上传原件到电脑端。
 * name 字段必须为 file（对应服务端 r.FormFile("file")），
 * device_id / source 通过 formData 传，服务端用 r.FormValue 读取。
 */
function uploadFile(filePath, name, source) {
  const base = getBase()
  if (!base) return Promise.reject(new Error('未配置桌面端地址'))

  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: base + '/api/files/upload',
      filePath: filePath,
      name: 'file',
      fileName: name,
      formData: {
        device_id: deviceId(),
        source: source || 'miniprogram'
      },
      success: function (res) {
        let data = res.data
        if (typeof data === 'string') {
          try { data = JSON.parse(data) } catch (e) {
            return reject(new Error('返回格式错误'))
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data)
        reject(new Error('HTTP ' + res.statusCode))
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '上传失败'))
      }
    })
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
  checkInvoices: checkInvoices,
  checkInvoiceNumbers: checkInvoiceNumbers,
  sendInvoices: sendInvoices,
  listFiles: listFiles,
  uploadFile: uploadFile,
  shouldAutoConnect: shouldAutoConnect,
  autoConnect: autoConnect,
  startAutoHeartbeat: startAutoHeartbeat,
  stopAutoHeartbeat: stopAutoHeartbeat
}
