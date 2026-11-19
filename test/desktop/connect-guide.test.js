/**
 * 新手引导折叠回归测试。
 *
 * 约定：展开/收起只由用户点标题决定并记住偏好，绝不跟 mini.online 联动
 * （45 秒心跳窗口会抖，绑上去会让卡片在用户眼前反复开合）。
 * 另外「最近设备」必须留在 details 外面，收起引导后仍能看到在线状态。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const appSource = fs.readFileSync(path.join(WEB, 'app.js'), 'utf8')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

console.log('--- 页面结构：引导可折叠，设备表在外面 ---')
const guideOpen = html.indexOf('<details id="connectGuide"')
const guideClose = html.indexOf('</details>', guideOpen)
const deviceAt = html.indexOf('id="deviceBody"')
check('有 connectGuide details', guideOpen >= 0, true)
check('默认展开（带 open 属性）', /<details id="connectGuide"[^>]*\bopen\b/.test(html), true)
check('有可点的 summary 标题', html.indexOf('class="guide-summary"') > guideOpen && html.indexOf('class="guide-summary"') < guideClose, true)
check('三步说明在 details 内', html.indexOf('class="steps"') < guideClose, true)
check('二维码在 details 内', html.indexOf('id="connectQr"') < guideClose, true)
check('地址列表在 details 内', html.indexOf('id="addressList"') < guideClose, true)
check('最近设备在 details 外（收起后仍可见）', deviceAt > guideClose, true)

console.log('\n--- 折叠逻辑不绑在线状态 ---')
const initBody = appSource.slice(
  appSource.indexOf('function initConnectGuide()'),
  appSource.indexOf('function startDesktopApp()')
)
check('折叠逻辑不引用 mini.online', initBody.indexOf('mini.online') < 0, true)
check('折叠逻辑不引用 statusData', initBody.indexOf('statusData') < 0, true)
check('startDesktopApp 调用了 initConnectGuide', /startDesktopApp\(\)[\s\S]*initConnectGuide\(\)/.test(appSource), true)

console.log('\n--- 偏好记忆行为 ---')
function loadApp(storageValue) {
  const listeners = {}
  const guide = {
    open: true,
    addEventListener(type, fn) { listeners[type] = fn }
  }
  const store = {
    data: storageValue === undefined ? {} : { [appSource.match(/GUIDE_STATE_KEY = '([^']+)'/)[1]]: storageValue },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null },
    setItem(k, v) { this.data[k] = v },
    removeItem(k) { delete this.data[k] }
  }
  const context = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Date, JSON, Math, encodeURIComponent, decodeURIComponent,
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    document: {
      hidden: false,
      getElementById(id) { return id === 'connectGuide' ? guide : null },
      addEventListener() {},
      createElement() { return { style: {}, setAttribute() {} } },
      body: { appendChild() {}, removeChild() {} },
      execCommand() {}
    },
    localStorage: store,
    navigator: { clipboard: null }
  }
  context.window = context
  vm.createContext(context)
  vm.runInContext(appSource, context)
  return { guide, listeners, store, context }
}

let r = loadApp(undefined)
r.context.initConnectGuide()
check('无偏好时保持默认展开', r.guide.open, true)
r.guide.open = false
r.listeners.toggle()
check('用户收起后写入偏好', r.store.getItem('ih_connect_guide_open'), 'closed')

r = loadApp('closed')
r.context.initConnectGuide()
check('上次收起则本次默认收起', r.guide.open, false)
r.guide.open = true
r.listeners.toggle()
check('用户再展开则清除偏好', r.store.getItem('ih_connect_guide_open'), null)

// 隐私模式：localStorage 访问抛错也不能拖垮页面
const noStore = loadApp(undefined)
noStore.context.localStorage = {
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
  removeItem() { throw new Error('denied') }
}
let threw = false
try {
  noStore.context.initConnectGuide()
  noStore.guide.open = false
  noStore.listeners.toggle()
} catch (e) {
  threw = true
}
check('localStorage 不可用时静默降级', threw, false)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount ? 1 : 0)
