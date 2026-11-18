/**
 * 局域网桌面端连接与发票传输回归测试。
 *
 *   node test/miniprogram/lanservice.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = {}
let lastRequest = null
let lastUpload = null
let heartbeatCount = 0
let stubMatches = {}
const stubSend = { added: 2, batch: 'B-TEST' }

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  request(options) {
    lastRequest = options
    if (options.url.indexOf('/api/devices/heartbeat') >= 0) heartbeatCount++
    if (options.url.indexOf('/api/invoices/check') >= 0) {
      return options.success({ statusCode: 200, data: { matches: stubMatches } })
    }
    if (options.url.indexOf('/api/invoices') >= 0 && options.method === 'GET') {
      return options.success({ statusCode: 200, data: { items: [{ id: 1, number: 'N1' }], total: 1 } })
    }
    if (options.url.indexOf('/api/invoices') >= 0) {
      return options.success({ statusCode: 200, data: stubSend })
    }
    if (options.url.indexOf('/api/files') >= 0) {
      return options.success({ statusCode: 200, data: { incoming: [], outgoing: [] } })
    }
    if (options.url.indexOf('/api/incoming/purge') >= 0) {
      return options.success({
        statusCode: 200,
        data: { removed: 2, confirmed: options.data.confirm, days: options.data.days }
      })
    }
    if (options.url.indexOf('/api/incoming') >= 0) {
      const ids = options.data.ids || []
      return options.success({ statusCode: 200, data: { deleted: ids.length || 1 } })
    }
    options.success({ statusCode: 200, data: { ok: true } })
  },
  uploadFile(options) {
    lastUpload = options
    options.success({ statusCode: 201, data: JSON.stringify({ name: 'a.xml', size: 100 }) })
  }
}

const lanservice = require('../../miniprogram/utils/lanservice')

check('自动补协议与去斜杠', lanservice.normalizeBase('192.168.1.20:8765/'), 'http://192.168.1.20:8765')
check('保留 https', lanservice.normalizeBase('https://pc.local:9000/'), 'https://pc.local:9000')
check('空值', lanservice.normalizeBase('  '), '')

const saved = lanservice.setBase('192.168.1.20:8765/')
check('保存地址', saved, 'http://192.168.1.20:8765')
check('读取地址', lanservice.getBase(), 'http://192.168.1.20:8765')
check('设备 ID 前缀', lanservice.deviceId().indexOf('mp-') === 0, true)

lanservice.heartbeat().then(function (data) {
  check('心跳成功', data.ok, true)
  check('心跳地址', lastRequest.url, 'http://192.168.1.20:8765/api/devices/heartbeat')
  check('心跳字段', lastRequest.data.device_id.indexOf('mp-') === 0, true)

  stubMatches = { N1: { number: 'N1', seller_name: '甲公司' } }
  return lanservice.checkInvoiceNumbers(['N1', 'N2'])
}).then(function (data) {
  check('查重地址', lastRequest.url, 'http://192.168.1.20:8765/api/invoices/check')
  check('查重请求', lastRequest.data.numbers, ['N1', 'N2'])
  check('查重结果', !!data.matches.N1, true)

  return lanservice.sendInvoices([{ number: 'N3', total: '10.00' }])
}).then(function (data) {
  check('发送地址', lastRequest.url, 'http://192.168.1.20:8765/api/invoices')
  check('发送携带设备', lastRequest.data.device_id.indexOf('mp-') === 0, true)
  check('发送返回', data.added, 2)

  return lanservice.listFiles()
}).then(function (data) {
  check('文件列表地址', lastRequest.url, 'http://192.168.1.20:8765/api/files')
  check('文件列表 GET', lastRequest.method, 'GET')
  check('文件列表 incoming', data.incoming, [])

  return lanservice.uploadFile('/tmp/a.xml', 'a.xml', 'miniprogram')
}).then(function (data) {
  check('上传地址', lastUpload.url, 'http://192.168.1.20:8765/api/files/upload')
  check('上传字段名', lastUpload.name, 'file')
  check('上传文件名', lastUpload.fileName, 'a.xml')
  check('上传文件路径', lastUpload.filePath, '/tmp/a.xml')
  check('上传携带设备', lastUpload.formData.device_id.indexOf('mp-') === 0, true)
  check('上传来源', lastUpload.formData.source, 'miniprogram')
  check('上传返回解析', data.name, 'a.xml')

  return lanservice.deleteIncoming(['r1', 'r2'])
}).then(function (data) {
  check('批量删除地址', lastRequest.url, 'http://192.168.1.20:8765/api/incoming')
  check('批量删除方法', lastRequest.method, 'DELETE')
  check('批量删除 ids', lastRequest.data.ids, ['r1', 'r2'])
  check('批量删除返回', data.deleted, 2)

  return lanservice.deleteIncoming([])
}).then(function () {
  check('不传 ids 表示清空全部', lastRequest.data.all, true)

  return lanservice.purgeIncoming(30, false)
}).then(function (data) {
  check('清理地址', lastRequest.url, 'http://192.168.1.20:8765/api/incoming/purge')
  check('清理提交保留天数', lastRequest.data.days, 30)
  check('清理默认只预览', lastRequest.data.confirm, false)
  check('清理预览数量', data.removed, 2)

  return lanservice.purgeIncoming(30, true)
}).then(function (data) {
  check('确认清理后 confirmed', data.confirmed, true)

  return lanservice.fetchInvoices('only_duplicates=1&sort=created')
}).then(function (data) {
  check('台账只读地址', lastRequest.url, 'http://192.168.1.20:8765/api/invoices?only_duplicates=1&sort=created')
  check('台账用 GET', lastRequest.method, 'GET')
  check('台账返回条数', data.total, 1)

  return lanservice.fetchInvoices('')
}).then(function () {
  check('空查询不带问号', lastRequest.url, 'http://192.168.1.20:8765/api/invoices')
  check('导出地址', lanservice.exportURL('sort=created'), 'http://192.168.1.20:8765/api/invoices/export?sort=created')
  check('导出地址无查询串', lanservice.exportURL(''), 'http://192.168.1.20:8765/api/invoices/export')

  lanservice.setBase('')
  check('未连接时导出地址为空', lanservice.exportURL('sort=created'), '')

  // ---------- 心跳节奏 ----------
  // 这里接管定时器：否则真定时器会把断言顺序搅乱。
  // 重点是「每次 startAutoHeartbeat 都要立刻补报一拍」——扫码换地址后
  // 若等下个 20 秒周期，桌面端看起来就像很久才连上。
  let intervals = 0
  let cleared = 0
  let lastInterval = null
  global.setInterval = function (fn, ms) {
    intervals++
    lastInterval = { fn: fn, ms: ms }
    return lastInterval
  }
  global.clearInterval = function () { cleared++ }

  lanservice.setBase('192.168.1.20:8765')
  heartbeatCount = 0
  lanservice.startAutoHeartbeat()
  check('启动心跳立刻报一次', heartbeatCount, 1)
  check('心跳周期 20 秒', lastInterval.ms, 20000)
  check('只注册一个定时器', intervals, 1)

  lanservice.setBase('192.168.1.30:8765')
  lanservice.startAutoHeartbeat()
  check('换地址后立刻补报', heartbeatCount, 2)
  check('换地址不重复注册定时器', intervals, 1)
  check('补报打到新地址', lastRequest.url, 'http://192.168.1.30:8765/api/devices/heartbeat')

  lanservice.stopAutoHeartbeat()
  check('停止心跳清掉定时器', cleared, 1)

  heartbeatCount = 0
  lanservice.startAutoHeartbeat()
  check('停止后重启又立刻报一次', heartbeatCount, 1)

  lanservice.setBase('')
  check('清空地址顺带停止心跳', cleared, 2)
  heartbeatCount = 0
  lastInterval.fn()
  check('定时器回调发现地址已清空就不再报', heartbeatCount, 0)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
