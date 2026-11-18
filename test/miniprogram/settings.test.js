/**
 * 设置页连接失败提示回归测试。
 *
 * 自动搜索失败原本只改页面底部那行 tiny 文案，真机上几乎看不见；
 * 用户会以为「点了没反应」。这里驱动真实页面方法，确认失败会弹 toast，
 * 同时不把「用户主动停止」当成错误提示。
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const toasts = []
global.wx = {
  getStorageSync() { return '' },
  setStorageSync() {},
  showToast(options) { toasts.push(options) },
  showModal() {},
  getSystemInfoSync() { return { platform: 'android' } },
  startLocalServiceDiscovery() {},
  stopLocalServiceDiscovery() {}
}

let pageConfig = null
global.Page = function (config) { pageConfig = config }

const lanservice = require('../../miniprogram/utils/lanservice')
require('../../miniprogram/pages/settings/settings')

function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) { Object.assign(this.data, patch) }
  return page
}

async function main() {
  console.log('--- 自动搜索失败 ---')
  let page = newPage()
  toasts.length = 0
  lanservice.autoConnect = () => Promise.reject(new Error('没有找到可连接的电脑'))
  await page.onDiscover()
  check('弹出错误提示', toasts.length, 1)
  check('提示文案', toasts[0] && toasts[0].title, '自动搜索未找到电脑')
  check('详情保留在页面', page.data.discoverTip, '没有找到可连接的电脑')
  check('搜索状态已复位', page.data.discovering, false)

  console.log('\n--- 用户主动停止 ---')
  page = newPage()
  toasts.length = 0
  lanservice.autoConnect = () => Promise.reject(new Error('搜索已取消'))
  await page.onDiscover()
  check('取消不弹错误提示', toasts.length, 0)
  check('取消文案', page.data.discoverTip, '已停止搜索')
  check('搜索状态已复位', page.data.discovering, false)

  console.log('\n--- 自动搜索成功 ---')
  page = newPage()
  toasts.length = 0
  lanservice.autoConnect = () => Promise.resolve('http://192.168.1.20:8765')
  await page.onDiscover()
  check('成功仍有提示', toasts.length, 1)
  check('成功文案', toasts[0] && toasts[0].title, '已自动连接')
  check('地址写入页面', page.data.desktopUrl, 'http://192.168.1.20:8765')
  check('成功详情', page.data.discoverTip, '已找到电脑：http://192.168.1.20:8765')
}

main().catch((error) => {
  failCount++
  console.error(error)
}).then(() => {
  console.log('\n' + failCount + ' failed')
  process.exit(failCount ? 1 : 0)
})
