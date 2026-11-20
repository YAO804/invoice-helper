/**
 * 弹窗关闭保护回归。
 *
 * 数据录入弹窗误点遮罩或按 Esc 不该把填了一半的内容丢掉：
 * 没改过直接关，改过要用户点头。只读抽屉不在此列。
 *
 *   node test/desktop/modal-dismiss.test.js
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
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true,
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
    classList: { add() {}, remove() {}, toggle() {} }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }

let confirmAnswer = true
const confirmCalls = []
global.confirm = function (message) {
  confirmCalls.push(message)
  return confirmAnswer
}

const keyHandlers = []
global.document = {
  getElementById: global.$,
  addEventListener(type, fn) { if (type === 'keydown') keyHandlers.push(fn) },
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') },
  body: { appendChild() {} }
}
global.window = { refresh: null }
global.alert = function () {}
global.setInterval = function () { return 0 }
global.fetchNumberWarning = async function () { return null }
global.createInvoice = async function () { return { number_warning: '' } }
global.updateInvoice = async function () { return { number_warning: '' } }
global.refreshLedger = async function () {}
global.fetchInvoices = async function () { return { items: [], duplicates: [] } }

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8'), { filename: 'modal-guard.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

const run = (code) => vm.runInThisContext(code)
run('bindLedgerEvents()')   // 注册 document 的 keydown，Esc 路径才会挂上

const modal = () => $('invoiceEditModal')
const batch = () => $('batchReimburserModal')
function reset() {
  confirmCalls.length = 0
  confirmAnswer = true
  run('closeEdit(); closeBatchReimburser(); selectedInvoices.clear()')
}
function esc() {
  keyHandlers.forEach((fn) => fn({ key: 'Escape', target: { closest: () => null } }))
}

console.log('--- 快照：粘贴直改 value 也算改过，改回原样不算 ---')
reset()
run("openForm({ id: 5, number: 'N1', code: 'C1', kind: '数电票', issue_date: '2026-11-20', total: '10.00', reimburser: '张三' })")
check('打开即建立快照', run('!!editSnapshot'), true)
check('没改不算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), false)
$('editNumber').value = 'N2'
check('改一个字段算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), true)
$('editNumber').value = 'N1'
check('改回原样不算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), false)

console.log('\n--- 遮罩/取消/Esc：没改直接关，改过先问 ---')
reset()
run('openForm(null)')
run('requestCloseEdit()')
check('没改过直接关', modal().hidden, true)
check('没改过不问用户', confirmCalls.length, 0)

reset()
run('openForm(null)')
$('editNumber').value = '半截号码'
confirmAnswer = false
run('requestCloseEdit()')
check('改过后点遮罩：取消则留着', modal().hidden, false)
check('改过后确实问了', confirmCalls.length, 1)
check('问的是放弃未保存内容', /没保存/.test(confirmCalls[0]), true)
check('取消后快照还在', run('!!editSnapshot'), true)

confirmAnswer = true
run('requestCloseEdit()')
check('改过后点遮罩：确认才关', modal().hidden, true)
check('关闭后清空快照', run('editSnapshot'), null)

console.log('\n--- Esc 走同一条保护路径 ---')
reset()
run('openForm(null)')
$('editCode').value = '1234567890'
confirmAnswer = false
esc()
check('Esc 被确认拦下', modal().hidden, false)
check('Esc 也走同一个确认', confirmCalls.length, 1)
confirmAnswer = true
esc()
check('Esc 确认后关闭', modal().hidden, true)

console.log('\n--- 批量补录弹窗同样受保护 ---')
reset()
run('selectedInvoices.add(1)')
run('fillReimburserForSelected()')
check('打开时快照为空', run('fieldsDirty(batchSnapshot, [["reimburser", "batchReimburserInput"]])'), false)
$('batchReimburserInput').value = '李四'
confirmAnswer = false
run('requestCloseBatchReimburser()')
check('批量弹窗取消后留着', batch().hidden, false)
check('批量弹窗也问用户', confirmCalls.length, 1)
confirmAnswer = true
run('requestCloseBatchReimburser()')
check('批量弹窗确认后关闭', batch().hidden, true)

console.log('\n--- 保存成功不再误弹 ---')
reset()
run('openForm(null)')
$('editNumber').value = 'N9'
;(async () => {
  await run('saveEdit()')
  check('保存后弹窗已关', modal().hidden, true)
  check('保存后快照清空', run('editSnapshot'), null)
  confirmCalls.length = 0
  run('requestCloseEdit()')
  check('保存后再关不弹确认', confirmCalls.length, 0)

  console.log('\n--- 页面接线 ---')
  const app = fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8')
  check('新增弹窗遮罩接保护', /invoiceEditModal'\)[\s\S]{0,120}requestCloseEdit\(\)/.test(app), true)
  check('批量弹窗遮罩接保护', /batchReimburserModal'\)[\s\S]{0,120}requestCloseBatchReimburser\(\)/.test(app), true)
  check('关闭/取消按钮接保护', /closeEditBtn'\) \|\| event\.target\.closest\('#cancelEditBtn'\)\) return requestCloseEdit/.test(app), true)
  check('Esc 接保护', /Escape'\)[\s\S]{0,200}requestCloseEdit/.test(app), true)
  check('真正关闭的 closeEdit 清快照', /function closeEdit\(\)[\s\S]{0,120}editSnapshot = null/.test(app), true)

  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
  check('保护模块在 app 之前加载', html.indexOf('/modal-guard.js') < html.indexOf('/ledger-app.js'), true)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
