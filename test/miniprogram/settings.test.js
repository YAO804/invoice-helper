/**
 * 设置页连接流程回归测试。
 *
 * 两条底线：失败必须有 toast（底部 tiny 文案太容易被忽略）；
 * 一个「扫码连接电脑」按钮必须同时认登录码和连接码，用户不用二选一。
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = { desktop_pin: '123456' }
const toasts = []
const modals = []
let modalAnswer = { confirm: true, content: '123456' }

global.wx = {
  getStorageSync(key) { return storage[key] },
  setStorageSync(key, value) { storage[key] = value },
  showToast(options) { toasts.push(options) },
  showModal(options) {
    modals.push({ title: options.title, content: options.content })
    options.success(modalAnswer)
  },
  getSystemInfoSync() { return { platform: 'android' } },
  startLocalServiceDiscovery() {},
  stopLocalServiceDiscovery() {}
}

let pageConfig = null
global.Page = function (config) { pageConfig = config }

const lanservice = require('../../miniprogram/utils/lanservice')
const discover = require('../../miniprogram/utils/discover')
const auth = require('../../miniprogram/utils/auth')
require('../../miniprogram/pages/settings/settings')

let scanResult = ''
let verifyOk = true
let heartbeatCount = 0
let confirmCalls = []

discover.scanRaw = () => Promise.resolve(scanResult)
discover.verifyUrl = () => Promise.resolve(verifyOk)
lanservice.startAutoHeartbeat = () => { heartbeatCount++ }
auth.confirmLogin = (base, code) => {
  confirmCalls.push({ base, code })
  return Promise.resolve({ ok: true })
}

function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) { Object.assign(this.data, patch) }
  return page
}

function reset() {
  toasts.length = 0
  modals.length = 0
  confirmCalls = []
  heartbeatCount = 0
  modalAnswer = { confirm: true, content: '123456' }
}

async function main() {
  console.log('--- 自动搜索失败 ---')
  let page = newPage(); reset()
  lanservice.autoConnect = () => Promise.reject(new Error('没有找到可连接的电脑'))
  await page.onDiscover()
  check('弹出错误提示', toasts.length, 1)
  check('提示文案', toasts[0] && toasts[0].title, '自动搜索未找到电脑')
  check('详情保留在页面', page.data.discoverTip, '没有找到可连接的电脑')
  check('搜索状态已复位', page.data.discovering, false)

  console.log('\n--- 用户主动停止 ---')
  page = newPage(); reset()
  lanservice.autoConnect = () => Promise.reject(new Error('搜索已取消'))
  await page.onDiscover()
  check('取消不弹错误提示', toasts.length, 0)
  check('取消文案', page.data.discoverTip, '已停止搜索')

  console.log('\n--- 自动搜索成功 ---')
  page = newPage(); reset()
  lanservice.autoConnect = () => Promise.resolve('http://192.168.1.20:8765')
  await page.onDiscover()
  check('成功文案', toasts[0] && toasts[0].title, '已自动连接')
  check('地址写入页面', page.data.desktopUrl, 'http://192.168.1.20:8765')

  console.log('\n--- 扫登录码：连地址 + 授权网页 ---')
  page = newPage(); reset()
  scanResult = 'invoice-helper://login?base=http%3A%2F%2F192.168.1.20%3A8765&c=abc123'
  await page.onScanConnect()
  check('确认登录请求', confirmCalls, [{ base: 'http://192.168.1.20:8765', code: 'abc123' }])
  check('地址写入页面', page.data.desktopUrl, 'http://192.168.1.20:8765')
  check('状态显示登录', page.data.desktopStatus, '已扫码登录')
  check('成功文案', toasts[0] && toasts[0].title, '连接并登录成功')
  check('心跳已启动', heartbeatCount, 1)
  check('扫码状态已复位', page.data.scanning, false)

  console.log('\n--- 扫登录码但本机没 PIN：现场设置 ---')
  page = newPage(); reset()
  delete storage.desktop_pin
  scanResult = 'invoice-helper://login?base=http%3A%2F%2F192.168.1.20%3A8765&c=abc123'
  await page.onScanConnect()
  check('弹出 PIN 输入框', modals.length, 1)
  check('PIN 已保存本机', storage.desktop_pin, '123456')
  check('确认登录请求', confirmCalls.length, 1)
  check('成功文案', toasts[toasts.length - 1] && toasts[toasts.length - 1].title, '连接并登录成功')

  console.log('\n--- 扫连接码：只连地址 ---')
  page = newPage(); reset()
  storage.desktop_pin = '123456'
  scanResult = 'invoice-helper://connect?base=http%3A%2F%2F192.168.1.21%3A8765'
  await page.onScanConnect()
  check('不请求登录', confirmCalls.length, 0)
  check('地址写入页面', page.data.desktopUrl, 'http://192.168.1.21:8765')
  check('状态显示连接', page.data.desktopStatus, '已扫码连接')
  check('提示还要扫登录码', page.data.discoverTip.indexOf('如需登录网页') > 0, true)
  check('成功文案', toasts[0] && toasts[0].title, '已连接电脑')

  console.log('\n--- 扫了不认识的码 ---')
  page = newPage(); reset()
  scanResult = 'not-a-qrcode'
  await page.onScanConnect()
  check('弹出错误提示', toasts.length, 1)
  check('提示文案', toasts[0] && toasts[0].title, '扫码失败')
  check('详情说明原因', page.data.discoverTip, '这不是攒票小匣的二维码')
  check('扫码状态已复位', page.data.scanning, false)
}

main().catch((error) => {
  failCount++
  console.error(error)
}).then(() => {
  console.log('\n' + failCount + ' failed')
  process.exit(failCount ? 1 : 0)
})
