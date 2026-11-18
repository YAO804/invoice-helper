/**
 * 小程序鉴权：PIN 存储 + 扫码登录 + 改 PIN。
 *
 * 凭证形态：只存 PIN，不存 token。这个工具没有用户体系、PIN 固定，
 * 引入 token 反而要做签发/刷新，没有收益。每个请求带 X-PIN 头即可。
 * 小程序不发布、只有自己装，PIN 存在本地 storage 是可接受的。
 */

const PIN_KEY = 'desktop_pin'
const LOGIN_SCHEME = 'invoice-helper://login'

function getPIN() {
  try {
    return String(wx.getStorageSync(PIN_KEY) || '')
  } catch (e) {
    return ''
  }
}

function setPIN(pin) {
  wx.setStorageSync(PIN_KEY, String(pin || '').trim())
}

function hasPIN() {
  return !!getPIN()
}

/** 所有发往桌面端的请求都要带 X-PIN，统一从这里取，避免各处手写。 */
function authHeader() {
  return { 'content-type': 'application/json', 'X-PIN': getPIN() }
}

/** 解析扫码登录串：invoice-helper://login?base=<地址>&c=<挑战码>。 */
function parseLoginCode(raw) {
  const text = String(raw || '').trim()
  if (!text || text.indexOf(LOGIN_SCHEME) !== 0) return null
  const start = text.indexOf('?')
  const params = {}
  const query = start >= 0 ? text.slice(start + 1) : ''
  query.split('&').forEach(function (part) {
    const eq = part.indexOf('=')
    if (eq < 0) return
    try {
      params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1))
    } catch (e) {
      // 单个参数解码失败就跳过，其余照常解析
    }
  })
  const base = /^https?:\/\//i.test(params.base || '') ? params.base.replace(/\/+$/, '') : ''
  if (!base || !params.c) return null
  return { base: base, code: params.c }
}

function requestJSON(base, method, path, data) {
  return new Promise(function (resolve, reject) {
    const header = { 'content-type': 'application/json' }
    const pin = getPIN()
    if (pin) header['X-PIN'] = pin
    wx.request({
      url: base + path,
      method: method,
      header: header,
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

/** 扫码登录：解析合并码 → 保存地址 → 用 PIN 确认挑战码。 */
function confirmLogin(base, code) {
  return requestJSON(base, 'POST', '/api/auth/confirm', { code: code, pin: getPIN() })
}

/** 修改 PIN：old 必须是当前 PIN，成功后本地同步更新。 */
function changePIN(oldPIN, newPIN, base) {
  return requestJSON(base, 'POST', '/api/auth/pin', {
    old_pin: oldPIN,
    new_pin: newPIN
  }).then(function (result) {
    setPIN(newPIN)
    return result
  })
}

/** 扫电脑网页上的登录二维码：一次扫码同时连地址并授权网页。 */
function scanLoginCode() {
  return new Promise(function (resolve, reject) {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: function (res) { resolve((res && res.result) || '') },
      fail: function (err) { reject(new Error('扫码失败：' + ((err && err.errMsg) || ''))) }
    })
  }).then(function (raw) {
    const parsed = parseLoginCode(raw)
    if (!parsed) return Promise.reject(new Error('这不是攒票小匣的登录二维码'))
    if (!hasPIN()) return Promise.reject(new Error('请先设置 PIN，再扫码登录'))
    return confirmLogin(parsed.base, parsed.code).then(function () {
      return parsed.base
    })
  })
}

module.exports = {
  getPIN: getPIN,
  setPIN: setPIN,
  hasPIN: hasPIN,
  authHeader: authHeader,
  parseLoginCode: parseLoginCode,
  confirmLogin: confirmLogin,
  changePIN: changePIN,
  scanLoginCode: scanLoginCode
}
