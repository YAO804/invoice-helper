const SERVICE_TYPE = '_http._tcp.'
const MATCH = 'invoice-helper'
const DEFAULT_SETTLE_MS = 1500
const DEFAULT_TIMEOUT_MS = 28000

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

function scan(options) {
  if (!supported()) {
    return Promise.reject(new Error('这台设备不支持自动发现，请手动填写电脑地址'))
  }

  const settings = options || {}
  const settleMs = settings.settleMs || DEFAULT_SETTLE_MS
  const timeoutMs = settings.timeoutMs || DEFAULT_TIMEOUT_MS

  return new Promise(function (resolve, reject) {
    const found = []
    let settleTimer = null
    let timeoutTimer = null
    let finished = false

    function onFound(res) {
      const url = candidate(res)
      if (!url || finished) return
      found.push(url)
      if (!settleTimer) settleTimer = setTimeout(stop, settleMs)
    }

    function onStop() {
      if (finished) return
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

    if (typeof wx.onLocalServiceFound === 'function') wx.onLocalServiceFound(onFound)
    if (typeof wx.onLocalServiceDiscoveryStop === 'function') wx.onLocalServiceDiscoveryStop(onStop)
    timeoutTimer = setTimeout(stop, timeoutMs)

    wx.startLocalServiceDiscovery({
      serviceType: SERVICE_TYPE,
      fail: function (err) {
        finish('', (err && err.errMsg) || '启动局域网搜索失败')
      }
    })
  })
}

module.exports = {
  supported: supported,
  scan: scan
}
