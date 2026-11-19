const discover = require('./discover')
const auth = require('./auth')

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

/**
 * 探活：只问电脑在不在，不碰台账也不校验 PIN。
 * 给「已连接」徽标用——地址存着不等于连得上，电脑关机了也得老实显示未连接。
 */
function probe() {
  const base = getBase()
  if (!base) return Promise.resolve(false)

  return new Promise(function (resolve) {
    wx.request({
      url: base + '/api/health',
      method: 'GET',
      timeout: 2000,
      success: function (res) {
        resolve(res.statusCode === 200 && !!(res.data && res.data.ok))
      },
      fail: function () { resolve(false) }
    })
  })
}

function heartbeat() {
  const base = getBase()
  if (!base) return Promise.resolve({ skipped: true })

  return new Promise(function (resolve, reject) {
    wx.request({
      url: base + '/api/devices/heartbeat',
      method: 'POST',
      header: auth.authHeader(),
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

function requestJSON(method, path, data) {
  const base = getBase()
  if (!base) return Promise.reject(new Error('未配置桌面端地址'))

  return new Promise(function (resolve, reject) {
    wx.request({
      url: base + path,
      method: method,
      header: auth.authHeader(),
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

function postJSON(path, data) { return requestJSON('POST', path, data) }
function getJSON(path) { return requestJSON('GET', path) }
function deleteJSON(path, data) { return requestJSON('DELETE', path, data) }

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
 * 拉取电脑端台账（只读）。
 * 小程序不做本地台账，台账页每次进来都问电脑端要最新数据，
 * 筛选和排序也交给电脑端算，两端口径才不会漂移。
 */
function fetchInvoices(query) {
  return getJSON('/api/invoices' + (query ? '?' + query : ''))
}

/** 电脑端 CSV 导出地址，给 wx.downloadFile 用；未连接时返回空串 */
function exportURL(query) {
  const base = getBase()
  if (!base) return ''
  return base + '/api/invoices/export' + (query ? '?' + query : '')
}

/**
 * 待取文件下载地址，给 wx.downloadFile 用；未连接时返回空串。
 * 文件名里可能有空格和中文，必须 encodeURIComponent，否则 wx 侧会拼出非法 URL。
 */
function outgoingURL(name) {
  const base = getBase()
  if (!base || !name) return ''
  return base + '/api/outgoing/' + encodeURIComponent(name) + '/download'
}

/** 删除电脑端的待取文件。不传 names 表示清空全部。 */
function deleteOutgoing(names) {
  const list = (names || []).filter(function (name) { return !!name })
  return deleteJSON('/api/outgoing', list.length ? { names: list } : { all: true })
}

/** 按修改时间清理待取文件；confirm=false 只返回将要删除的数量 */
function purgeOutgoing(days, confirm) {
  return postJSON('/api/outgoing/purge', { days: days, confirm: !!confirm })
}

/**
 * 删除电脑端已收文件。不传 ids 表示清空全部。
 * 只删电脑端副本，手机里的台账记录和原件不受影响。
 */
function deleteIncoming(ids) {
  const list = (ids || []).filter(function (id) { return !!id })
  return deleteJSON('/api/incoming', list.length ? { ids: list } : { all: true })
}

/** 按保留天数清理电脑端文件；confirm=false 只返回将要删除的数量 */
function purgeIncoming(days, confirm) {
  return postJSON('/api/incoming/purge', { days: days, confirm: !!confirm })
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
      header: { 'X-PIN': auth.getPIN() },
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

/**
 * 启动心跳：调用时立刻报一次，之后按 HEARTBEAT_MS 周期报。
 *
 * 每次都要补这一拍。之前写成「有 timer 就直接 return」，结果换地址（扫码/自动发现）
 * 之后要等下一个 20 秒周期电脑端才看到设备，用户会以为没连上。
 */
function startAutoHeartbeat() {
  if (!getBase()) return
  heartbeat().catch(function () {})
  if (timer) return
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
  authHeader: auth.authHeader,
  getPIN: auth.getPIN,
  setPIN: auth.setPIN,
  hasPIN: auth.hasPIN,
  normalizeBase: normalizeBase,
  getBase: getBase,
  setBase: setBase,
  deviceId: deviceId,
  probe: probe,
  heartbeat: heartbeat,
  checkInvoices: checkInvoices,
  checkInvoiceNumbers: checkInvoiceNumbers,
  sendInvoices: sendInvoices,
  listFiles: listFiles,
  fetchInvoices: fetchInvoices,
  exportURL: exportURL,
  outgoingURL: outgoingURL,
  deleteOutgoing: deleteOutgoing,
  purgeOutgoing: purgeOutgoing,
  deleteIncoming: deleteIncoming,
  purgeIncoming: purgeIncoming,
  uploadFile: uploadFile,
  shouldAutoConnect: shouldAutoConnect,
  autoConnect: autoConnect,
  startAutoHeartbeat: startAutoHeartbeat,
  stopAutoHeartbeat: stopAutoHeartbeat
}
