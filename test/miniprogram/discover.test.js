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
let startCount = 0
let failFirstStart = false
let scanRaw = ''
let scanFails = false
let emitStopOnStop = true

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
  stopLocalServiceDiscovery() { stopCount++; if (emitStopOnStop) emitStop() },
  startLocalServiceDiscovery(options) {
    startOptions = options
    startCount++
    if (failFirstStart) {
      failFirstStart = false
      setTimeout(function () {
        options.fail({ errMsg: 'startLocalServiceDiscovery:fail:scan task already exist' })
      }, 1)
      return
    }
    setTimeout(function () {
      emitFound({ serviceName: 'other-device', ip: '192.168.1.99', port: 9000 })
      emitFound({ serviceName: 'invoice-helper-desktop', ip: '192.168.1.20', port: 8765 })
    }, 5)
  },
  scanCode(options) {
    if (scanFails) return options.fail({ errMsg: 'scanCode:fail cancel' })
    options.success({ result: scanRaw })
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
  platform = 'android'
  stopCount = 0
  startCount = 0
  failFirstStart = true
  return discover.scan({ settleMs: 10, timeoutMs: 200 }).then(function (url) {
    check('already exist 自愈后仍发现电脑', url, 'http://192.168.1.20:8765')
    check('自愈时先 stop 再重试', stopCount, 2)
    check('重试后 start 两次', startCount, 2)
  })
}).then(function () {
  console.log('\n--- stop 回调兜底与取消 ---')
  // 关键回归：微信 stop 后不发 onStop 回调时，必须靠兜底定时器自行结算
  emitStopOnStop = false
  return discover.scan({ settleMs: 10, timeoutMs: 300 }).then(function (url) {
    check('onStop 不来也能靠兜底结算', url, 'http://192.168.1.20:8765')
    check('兜底结算后监听器已清理', foundHandler, null)
    emitStopOnStop = true
  })
}).then(function () {
  // 取消：正在搜索时 cancel，Promise 应以「取消」错误结算且不再卡住
  emitStopOnStop = false
  const pending = discover.scan({ settleMs: 5000, timeoutMs: 10000 })
  setTimeout(function () { discover.cancel() }, 10)
  return pending.then(function () {
    check('取消搜索应拒绝', false, true)
  }, function (error) {
    check('取消搜索有提示', error.message.indexOf('取消') >= 0, true)
    check('取消后监听器已清理', foundHandler, null)
    emitStopOnStop = true
    // 取消后能立刻重新发起一次扫描，证明 activeRun 没有被卡死
    return discover.scan({ settleMs: 10, timeoutMs: 300 }).then(function (url) {
      check('取消后可重新搜索', url, 'http://192.168.1.20:8765')
    })
  })
}).then(function () {
  console.log('\n--- 扫码连接 ---')
  check('解析连接串', discover.parseConnectCode('invoice-helper://connect?base=http%3A%2F%2F192.168.1.20%3A8765'),
    'http://192.168.1.20:8765')
  check('直接给 http 地址也认', discover.parseConnectCode('http://192.168.1.20:8765/'),
    'http://192.168.1.20:8765')
  check('无关二维码不认', discover.parseConnectCode('WIFI:S:office;T:WPA;;'), '')
  check('空内容不认', discover.parseConnectCode(''), '')
  check('base 不是 http 不认', discover.parseConnectCode('invoice-helper://connect?base=ftp%3A%2F%2Fx'), '')

  scanRaw = 'invoice-helper://connect?base=http%3A%2F%2F192.168.1.20%3A8765'
  return discover.scanConnectCode().then(function (url) {
    check('扫码得到可用地址', url, 'http://192.168.1.20:8765')

    scanRaw = 'invoice-helper://connect?base=http%3A%2F%2F192.168.1.99%3A8765'
    return discover.scanConnectCode().then(function () {
      check('电脑没响应应拒绝', false, true)
    }, function (error) {
      check('电脑没响应有提示', error.message.indexOf('没响应') >= 0, true)
    })
  }).then(function () {
    scanFails = true
    return discover.scanConnectCode().then(function () {
      check('取消扫码应拒绝', false, true)
    }, function (error) {
      check('取消扫码有提示', error.message.indexOf('扫码失败') >= 0, true)
    })
  })
}).then(function () {
  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
