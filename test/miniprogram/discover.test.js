/**
 * 局域网电脑自动发现回归测试。
 *
 *   node test/miniprogram/discover.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

let platform = 'android'
let foundHandler = null
let stopHandler = null
let startOptions = null
let stopCount = 0

function emitFound(res) {
  if (foundHandler) foundHandler(res)
}

function emitStop() {
  if (stopHandler) stopHandler()
}

global.wx = {
  getSystemInfoSync() { return { platform: platform } },
  onLocalServiceFound(fn) { foundHandler = fn },
  offLocalServiceFound(fn) { if (foundHandler === fn) foundHandler = null },
  onLocalServiceDiscoveryStop(fn) { stopHandler = fn },
  offLocalServiceDiscoveryStop(fn) { if (stopHandler === fn) stopHandler = null },
  stopLocalServiceDiscovery() { stopCount++; emitStop() },
  startLocalServiceDiscovery(options) {
    startOptions = options
    setTimeout(function () {
      emitFound({ serviceName: 'other-device', ip: '192.168.1.99', port: 9000 })
      emitFound({ serviceName: 'invoice-helper-desktop', ip: '192.168.1.20', port: 8765 })
    }, 5)
  },
  request(options) {
    if (options.url.indexOf('192.168.1.20') >= 0) {
      options.success({ statusCode: 200, data: { ok: true } })
    } else {
      options.fail({ errMsg: 'request:fail' })
    }
  }
}

const discover = require('../../miniprogram/utils/discover')

check('安卓支持自动发现', discover.supported(), true)

discover.scan({ settleMs: 10, timeoutMs: 200 }).then(function (url) {
  check('发现电脑地址', url, 'http://192.168.1.20:8765')
  check('搜索服务类型', startOptions.serviceType, '_http._tcp.')
  check('停止搜索次数', stopCount, 1)
  check('监听器已清理', foundHandler, null)

  platform = 'ios'
  check('iOS 不支持自动发现', discover.supported(), false)
  return discover.scan().then(function () {
    check('iOS 应拒绝', false, true)
  }).catch(function (error) {
    check('iOS 给出手动提示', error.message.indexOf('手动') >= 0, true)
  })
}).then(function () {
  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
