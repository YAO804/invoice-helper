/**
 * 页面内提示框回归。
 *
 * 原生 alert 带着「localhost:8765 显示」的浏览器外壳，跟页面不是一套样式。
 * 加载 alert-dialog.js 后所有 alert(...) 都进页面内提示框；调用点不用改。
 *
 *   node test/desktop/alert-dialog.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const elements = {}
function makeEl(id) {
  const listeners = {}
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn) },
    fire(type) { (listeners[type] || []).forEach((fn) => fn({})) },
    focus() { this.focused = true },
    setAttribute() {}, removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }
global.document = {
  getElementById: global.$,
  addEventListener() {},
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') }
}
global.window = {}

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'alert-dialog.js'), 'utf8'), { filename: 'alert-dialog.js' })

console.log('--- 加载即接管原生 alert ---')
check('window.alert 被换成页面内的那个', global.window.alert, showAlert)

console.log('\n--- 消息上屏 ---')
;['新增失败：请填写票种；请填写开票日期；价税合计必须填数字，例如 176.99',
  '请先选择发票', '', null].forEach((message, i) => {
  global.window.alert(message)
  check('第 ' + (i + 1) + ' 条消息写进弹窗', $('alertMessage').textContent,
    message == null ? '' : String(message))
  check('第 ' + (i + 1) + ' 条弹窗显示', $('alertModal').hidden, false)
})

console.log('\n--- 多行消息不丢换行 ---')
global.window.alert('请填写发票代码\n价税合计必须填数字，例如 176.99')
check('换行原样保留给页面（靠 white-space: pre-line 显示）',
  $('alertMessage').textContent, '请填写发票代码\n价税合计必须填数字，例如 176.99')

console.log('\n--- 只认按钮关闭 ---')
$('alertOkBtn').fire('click')
check('点知道了才收起', $('alertModal').hidden, true)
check('打开时焦点给按钮', $('alertOkBtn').focused, true)

console.log('\n--- 页面接线 ---')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
check('提示框节点在页面里', /id="alertModal" class="modal alert-modal"/.test(html), true)
check('接管脚本最先加载', html.indexOf('/alert-dialog.js') < html.indexOf('/ledger-app.js'), true)
check('接管脚本在预览脚之前', html.indexOf('/alert-dialog.js') < html.indexOf('/preview.js'), true)
check('只有一个知道了按钮', /id="alertOkBtn"[^>]*class="btn"/.test(html), true)
const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8')
check('提示框层级最高', /\.alert-modal \{ z-index: 80; \}/.test(css), true)
check('多行消息按 pre-line 显示', /\.alert-message[\s\S]{0,160}white-space: pre-line/.test(css), true)

console.log('\n--- 各调用点仍统一写 alert(...) ---')
const files = ['ledger-app.js', 'app.js', 'preview.js']
files.forEach((file) => {
  const src = fs.readFileSync(path.join(WEB, file), 'utf8')
  check(file + ' 没有自己画提示弹窗', /getElementById\(['"]alertModal/.test(src), false)
})

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
