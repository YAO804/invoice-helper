/**
 * 局域网桌面端连接回归测试。
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

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  request(options) {
    lastRequest = options
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
  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
