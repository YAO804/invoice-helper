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
let stubMatches = {}
const stubSend = { added: 2, batch: 'B-TEST' }

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  request(options) {
    lastRequest = options
    if (options.url.indexOf('/api/invoices/check') >= 0) {
      return options.success({ statusCode: 200, data: { matches: stubMatches } })
    }
    if (options.url.indexOf('/api/invoices') >= 0) {
      return options.success({ statusCode: 200, data: stubSend })
    }
    options.success({ statusCode: 200, data: { ok: true } })
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

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
