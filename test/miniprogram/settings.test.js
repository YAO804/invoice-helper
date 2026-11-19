/**
 * 设置页连接流程回归测试。
 *
 * 三条底线：失败必须弹模态框说清原因和下一步（toast 装不下原因）；
 * 用户自己取消（扫码返回、停搜、取消设 PIN）不许当成失败报错；
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
    if (options.success) options.success(modalAnswer)
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
let scanError = null
let verifyOk = true
let heartbeatCount = 0
let confirmCalls = []

discover.scanRaw = () => (scanError ? Promise.reject(scanError) : Promise.resolve(scanResult))
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
  scanError = null
  verifyOk = true
}

/** 失败时唯一该弹的框：标题说原因，正文说下一步 */
function failureModal() {
  return modals[modals.length - 1] || {}
}

async function main() {
  console.log('--- 自动搜索失败：模态框说清原因与下一步 ---')
  let page = newPage(); reset()
  lanservice.autoConnect = () => Promise.reject(new Error('没有找到电脑，请确认电脑端已开启、且手机与电脑在同一 WiFi，或改用扫码连接'))
  await page.onDiscover()
  check('不弹 toast', toasts.length, 0)
  check('弹一个模态框', modals.length, 1)
  check('标题说结论', failureModal().title, '没找到电脑')
  check('正文给下一步', failureModal().content.indexOf('扫码连接电脑') >= 0, true)
  check('状态卡留结论', page.data.discoverTip, '没找到电脑')
  check('搜索状态已复位', page.data.discovering, false)

  console.log('\n--- 找到但连不上：与「没找到」区分开 ---')
  page = newPage(); reset()
  lanservice.autoConnect = () => Promise.reject(new Error('找到电脑但连不上，请确认电脑端服务在运行、且手机与电脑在同一 WiFi'))
  await page.onDiscover()
  check('标题区分连不上', failureModal().title, '找到电脑了但连不上')
  check('正文提服务在运行', failureModal().content.indexOf('同一个 WiFi') >= 0, true)
  check('状态卡同步', page.data.discoverTip, '找到电脑了但连不上')

  console.log('\n--- 用户主动停止搜索：静默 ---')
  page = newPage(); reset()
  lanservice.autoConnect = () => Promise.reject(new Error('搜索已取消'))
  await page.onDiscover()
  check('不弹提示', toasts.length + modals.length, 0)
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
  check('状态改成已连接', page.data.status, 'ok')
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
  check('状态改成已连接', page.data.status, 'ok')
  check('提示还要扫登录码', page.data.discoverTip.indexOf('如需登录网页') > 0, true)
  check('成功文案', toasts[0] && toasts[0].title, '已连接电脑')

  console.log('\n--- 扫了不认识的码：说清扫哪种码 ---')
  page = newPage(); reset()
  scanResult = 'not-a-qrcode'
  await page.onScanConnect()
  check('不弹 toast', toasts.length, 0)
  check('标题说结论', failureModal().title, '扫错二维码了')
  check('正文指到网页扫码入口', failureModal().content.indexOf('连接小程序') >= 0, true)
  check('状态卡留结论', page.data.discoverTip, '扫错二维码了')
  check('扫码状态已复位', page.data.scanning, false)

  console.log('\n--- 扫码时按返回键：静默 ---')
  page = newPage(); reset()
  scanError = new Error('已取消扫码')
  scanError.cancelled = true
  await page.onScanConnect()
  check('不弹提示', toasts.length + modals.length, 0)
  check('取消文案', page.data.discoverTip, '已取消扫码')
  check('扫码状态已复位', page.data.scanning, false)

  console.log('\n--- PIN 不对：告诉用户去哪儿改 ---')
  page = newPage(); reset()
  scanResult = 'invoice-helper://login?base=http%3A%2F%2F192.168.1.20%3A8765&c=abc123'
  auth.confirmLogin = () => Promise.reject(new Error('HTTP 401'))
  await page.onScanConnect()
  check('标题说 PIN 不对', failureModal().title, 'PIN 不对')
  check('正文指到设置 PIN', failureModal().content.indexOf('设置 PIN') >= 0, true)
  check('不把 401 漏给用户', failureModal().content.indexOf('401') < 0, true)
  check('状态卡留结论', page.data.discoverTip, 'PIN 不对')

  console.log('\n--- 连接码地址探活失败 ---')
  page = newPage(); reset()
  scanResult = 'invoice-helper://connect?base=http%3A%2F%2F192.168.1.22%3A8765'
  verifyOk = false
  await page.onScanConnect()
  check('标题说连不上', failureModal().title, '连不上电脑')
  check('正文提同一 WiFi', failureModal().content.indexOf('同一个 WiFi') >= 0, true)
  check('地址没被写入', page.data.desktopUrl === 'http://192.168.1.22:8765', false)
  check('扫码状态已复位', page.data.scanning, false)

  console.log('\n--- 没 PIN 又在输入框取消：静默 ---')
  page = newPage(); reset()
  delete storage.desktop_pin
  scanResult = 'invoice-helper://login?base=http%3A%2F%2F192.168.1.20%3A8765&c=abc123'
  modalAnswer = { confirm: false, content: '' }
  await page.onScanConnect()
  check('只弹过 PIN 输入框', modals.length, 1)
  check('没弹失败框', failureModal().title, '设置 PIN')
  check('取消文案', page.data.discoverTip, '已取消扫码登录')
  check('没有发起登录请求', confirmCalls.length, 0)
  console.log('\n--- 主按钮跟着状态换词 ---')
  page = newPage(); reset()
  storage.desktop_base_url = 'http://192.168.1.20:8765'
  page.applyStatus('none')
  check('没连上时主按钮是去扫码', page.data.primaryLabel, '扫码连接电脑')
  page.applyStatus('ok')
  check('已连接时主按钮变重新检测', page.data.primaryLabel, '重新检测')
  check('已连接时才给断开入口', page.data.hasBase, true)
  check('大字结论是已连接', page.data.statusTitle, '已连接')
  check('地址单独一行', page.data.statusHost, '192.168.1.20:8765')
  page.applyStatus('fail')
  check('连不上时主按钮仍是重新检测', page.data.primaryLabel, '重新检测')
  check('连不上也要留住地址', page.data.statusHost, '192.168.1.20:8765')
  page.applyStatus('checking')
  check('检测中主按钮不可用', page.data.primaryLabel, '正在检测')

  console.log('\n--- 测试连接：结果写回状态卡 ---')
  page = newPage(); reset()
  lanservice.probe = () => Promise.resolve(true)
  page.setData({ desktopUrl: 'http://192.168.1.20:8765' })
  await page.onTestDesktop()
  check('状态变已连接', page.data.status, 'ok')
  check('结果写在卡片上，不只在 toast 里', page.data.discoverTip, '已连通 192.168.1.20:8765')

  console.log('\n--- 断开连接：清地址、状态改口 ---')
  page = newPage(); reset()
  storage.desktop_base_url = 'http://192.168.1.20:8765'
  modalAnswer = { confirm: true }
  page.onDisconnect()
  check('本机地址已清空', lanservice.getBase(), '')
  check('状态回到未连接', page.data.status, 'none')
  check('主按钮回到扫码', page.data.primaryLabel, '扫码连接电脑')
  check('输入框同步清空', page.data.desktopUrl, '')
  check('结果写在状态卡上', page.data.discoverTip, '已断开电脑')

  console.log('\n--- 断开确认框点取消：什么都不动 ---')
  page = newPage(); reset()
  storage.desktop_base_url = 'http://192.168.1.20:8765'
  modalAnswer = { confirm: false }
  page.onDisconnect()
  check('地址还在', lanservice.getBase(), 'http://192.168.1.20:8765')
}

main().catch((error) => {
  failCount++
  console.error(error)
}).then(() => {
  console.log('\n' + failCount + ' failed')
  process.exit(failCount ? 1 : 0)
})
