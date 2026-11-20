/**
 * 手动录入的号码/代码位数提示回归。
 *
 * 导入预览已经有位数提示，手动录入不能反过来说「正常」——
 * 规则只在后端算一份，网页通过接口取文案，保存后后端再给一次兜底。
 *
 *   node test/desktop/manual-number-warning.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const WEB = path.join(__dirname, '../../desktop/web')
const elements = {}
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true, disabled: false,
    addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} }
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
global.alert = function () {}

let requestedURL = ''
global.requestJSON = function (url) {
  requestedURL = url
  return Promise.resolve({ warning: '两列可能填反了', field: 'both' })
}

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-api.js'), 'utf8'), { filename: 'ledger-api.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8'), { filename: 'modal-guard.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

const run = (code) => vm.runInThisContext(code)

console.log('--- 提示文案取自身后端的同一套规则 ---')
run("fetchNumberWarning('032002300911', '00813251')")
check('把号码和代码都带给接口', requestedURL,
  '/api/invoices/number-warning?number=032002300911&code=00813251')
run('fetchNumberWarning("", "")')
check('两列都空时不发多余参数', requestedURL, '/api/invoices/number-warning?')

console.log('\n--- 提示放到对应输入框下面 ---')
// 截图里的场景：号码 8 位正常、代码 8 位不对，文案讲代码就该在代码下面
run("renderNumberWarning({ warning: '发票代码 8 位，不像常见的 10 或 12 位', field: 'code' })")
check('代码提示：代码下方显示', $('editCodeWarning').hidden, false)
check('代码提示：号码下方不显示', $('editNumberWarning').hidden, true)
check('代码提示写进代码下方', $('editCodeWarning').textContent, '发票代码 8 位，不像常见的 10 或 12 位')

run("renderNumberWarning({ warning: '发票号码 12 位，更像发票代码', field: 'number' })")
check('号码提示：号码下方显示', $('editNumberWarning').hidden, false)
check('号码提示：代码下方不显示', $('editCodeWarning').hidden, true)

run("renderNumberWarning({ warning: '两列可能填反了', field: 'both' })")
check('两列都填反时代码下方显示', $('editCodeWarning').hidden, false)
check('两列都填反时不重复两遍', $('editNumberWarning').hidden, true)

run('renderNumberWarning(null)')
check('没提示时号码下方收起', $('editNumberWarning').hidden, true)
check('没提示时代码下方收起', $('editCodeWarning').hidden, true)

console.log('\n--- 输入时取提示，不拦截录入 ---')
global.fetchNumberWarning = async () => ({ warning: '两列可能填反了', field: 'both' })
$('editNumber').value = '032002300911'
$('editCode').value = '00813251'
;(async () => {
  await run('refreshNumberWarning()')
  check('填上后端给的文案', $('editCodeWarning').textContent, '两列可能填反了')

  $('editNumber').value = ''
  $('editCode').value = ''
  await run('refreshNumberWarning()')
  check('清空输入后提示消失', $('editNumberWarning').hidden && $('editCodeWarning').hidden, true)

  // 关掉弹窗（或又改了值）后，在途的旧结果不能盖到下一次录入上
  let resolveOld
  global.fetchNumberWarning = () => new Promise((resolve) => { resolveOld = resolve })
  $('editNumber').value = '123'
  const pending = run('refreshNumberWarning()')
  run('numberWarningSeq++')
  resolveOld({ warning: '过期结果', field: 'number' })
  await pending
  check('过期的提示不会盖上来', $('editNumberWarning').textContent, '')

  console.log('\n--- 页面接线 ---')
  const app = fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8')
  check('号码输入绑定提示', app.includes("editNumber').addEventListener('input', scheduleNumberWarning"), true)
  check('代码输入绑定提示', app.includes("editCode').addEventListener('input', scheduleNumberWarning"), true)
  check('打开表单就检查已有值', app.includes('refreshNumberWarning()'), true)
  check('保存结果带位数提示的兜底', app.includes('response.number_warning'), true)
  check('提示不拦住保存（没有 return 挡在写入前）', /if \(!payload\.number\) return alert/.test(app), true)

  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
  check('号码提示条嵌在号码输入框下', /发票号码[\s\S]{0,160}id="editNumberWarning"[\s\S]{0,160}发票代码/.test(html), true)
  check('代码提示条嵌在代码输入框下', /发票代码[\s\S]{0,160}id="editCodeWarning"[\s\S]{0,160}票种/.test(html), true)
  check('提示条复用红色样式', /id="editCodeWarning"[^>]*class="[^"]*number-note/.test(html), true)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})()
