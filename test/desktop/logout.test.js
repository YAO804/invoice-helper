/**
 * 桌面网页退出登录回归测试。
 *
 *   node test/desktop/logout.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const source = fs.readFileSync(path.join(WEB, 'login.js'), 'utf8')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const listeners = {}
const elements = {}
function makeEl(id) {
  return {
    id, hidden: false, textContent: '', src: '',
    addEventListener(type, fn) { listeners[id + ':' + type] = fn }
  }
}

let fetchCalls = []
let fetchOk = true
let reloads = 0
let toasts = []

const context = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Promise, Date, JSON, encodeURIComponent,
  showToast(msg) { toasts.push(msg) },
  fetch(url, opts) {
    fetchCalls.push({ url, opts })
    return Promise.resolve({ ok: fetchOk, status: fetchOk ? 200 : 500 })
  },
  window: { location: { reload() { reloads++ } } },
  document: {
    getElementById(id) { return elements[id] || (elements[id] = makeEl(id)) },
    addEventListener() {}
  }
}
vm.createContext(context)
vm.runInContext(source, context)

console.log('--- 页面入口 ---')
check('header 有退出按钮', html.indexOf('id="logoutBtn"') >= 0, true)

console.log('\n--- 事件绑定 ---')
context.bindLoginEvents()
check('退出按钮绑了点击', typeof listeners['logoutBtn:click'], 'function')
check('刷新二维码仍绑定', typeof listeners['loginRefreshBtn:click'], 'function')

async function main() {
  console.log('\n--- 退出成功：清会话后重载 ---')
  await context.logout()
  check('调用 logout 接口', fetchCalls[0].url, '/api/auth/logout')
  check('用 POST', fetchCalls[0].opts.method, 'POST')
  check('带同源凭证', fetchCalls[0].opts.credentials, 'same-origin')
  check('重载回扫码登录态', reloads, 1)
  check('没有错误提示', toasts.length, 0)

  console.log('\n--- 退出失败：留在原页并提示 ---')
  fetchOk = false
  await context.logout()
  check('不再重载', reloads, 1)
  check('给出失败提示', toasts, ['退出失败，请重试'])

  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
