/**
 * 收票页的连接状态：徽标必须由真实请求背书。
 *
 *   node test/miniprogram/collect-status.test.js
 *
 * 原来的 bug：只看「存没存过电脑地址」就把右上角写成「已连接」，
 * 电脑关机、换 WiFi、服务没起来，照样绿着一个已连接，台账一张也同步不到。
 * 这里守住三种状态：没配地址说未连接、请求失败说连不上、同步成功才说已连接。
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

/* ---------- 极简 wx：只实现收票页与 lanservice 用到的接口 ---------- */

const storage = {}
let responder = function () { throw new Error('没有设置请求处理') }

global.wx = {
  getStorageSync(key) { return storage[key] === undefined ? '' : storage[key] },
  setStorageSync(key, value) { storage[key] = value },
  request(options) { responder(options) },
  getFileSystemManager() { return {} },
  getSystemInfoSync() { return {} },
  showToast() {},
  showModal() {}
}
global.getApp = function () { return { globalData: {} } }

let pageConfig = null
global.Page = function (config) { pageConfig = config }
require('../../miniprogram/pages/collect/collect')

function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) { Object.assign(this.data, patch) }
  return page
}

/** 请求一律成功，返回台账两行 */
function okHandler(options) {
  options.success({ statusCode: 200, data: { items: [{ id: 1 }, { id: 2 }], duplicates: [], total: 2 } })
}

/** 请求一律失败 */
function downHandler(options) {
  options.fail({ errMsg: 'request:fail timeout' })
}

async function run() {
  console.log('--- 没配过电脑地址 ---')
  storage.desktop_base_url = ''
  const none = newPage()
  await none.refresh()
  check('徽标是未连接', none.data.statusBadge, '未连接')
  check('未连接是灰的', none.data.statusTone, 'badge-grey')
  check('说清为什么不能收票', none.data.statusHint.indexOf('必须先连上电脑') >= 0, true)
  check('给出连接入口', none.data.needConnect, true)
  check('不知道地址就不发请求', none.data.baseText, '')

  console.log('\n--- 存过地址但连不上 ---')
  storage.desktop_base_url = 'http://192.168.1.20:8765'
  responder = downHandler
  const down = newPage()
  await down.refresh()
  check('徽标是连不上（不是已连接）', down.data.statusBadge, '连不上')
  check('连不上用警示色', down.data.statusTone, 'badge-warn')
  check('把地址写出来方便核对', down.data.statusHint.indexOf('192.168.1.20') >= 0, true)
  check('仍然给出连接入口', down.data.needConnect, true)
  check('拿不到台账就不编造张数', down.data.ledgerCount, 0)

  console.log('\n--- 同步成功 ---')
  responder = okHandler
  const up = newPage()
  await up.refresh()
  check('这时才叫已连接', up.data.statusBadge, '已连接')
  check('已连接不用警示色', up.data.statusTone, '')
  check('复述台账张数', up.data.statusHint.indexOf('现有 2 张') >= 0, true)
  check('连上了就收起连接入口', up.data.needConnect, false)

  console.log('\n--- 连上之后再断 ---')
  // 电脑中途关机：下一次同步失败，徽标必须立刻改口，不能停在已连接
  responder = downHandler
  await up.syncLedger()
  check('徽标立刻改成连不上', up.data.statusBadge, '连不上')
  check('张数清零，不显示上次的旧数据', up.data.ledgerCount, 0)
  check('连接入口放回来', up.data.needConnect, true)

  console.log('\n--- 地址被清掉（退出登录） ---')
  storage.desktop_base_url = ''
  const cleared = newPage()
  await cleared.refresh()
  check('回到未连接', cleared.data.statusBadge, '未连接')

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
}

run().catch(function (error) {
  console.error('测试异常：', error)
  process.exit(1)
})
