/**
 * 弹窗关闭行为回归。
 *
 * 弹窗只能靠按钮关闭：点遮罩、按 Esc 都不关，免得误操作丢掉填了一半的内容。
 * 点「关闭 / 取消」时若改过内容，弹页面内确认框（不用浏览器原生 confirm）。
 * 只读抽屉也只能靠它的「关闭」按钮收起。
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
  const listeners = {}
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn) },
    fire(type, event) { (listeners[type] || []).forEach((fn) => fn(event)) },
    setAttribute() {}, removeAttribute() {}, focus() {},
    classList: { add() {}, remove() {}, toggle() {} }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }

const keyHandlers = []
const clickHandlers = []
global.document = {
  getElementById: global.$,
  addEventListener(type, fn) {
    if (type === 'keydown') keyHandlers.push(fn)
    if (type === 'click') clickHandlers.push(fn)
  },
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') },
  body: { appendChild() {} }
}
global.window = { refresh: null }
global.alert = function () {}
global.setInterval = function () { return 0 }
// 原生 confirm 一旦被调用就说明退回丑弹窗了，这里让它直接记账并答「放弃」
let nativeConfirmCalls = 0
global.confirm = function () { nativeConfirmCalls++; return true }
global.fetchNumberWarning = async function () { return null }
global.createInvoice = async function () { return { number_warning: '' } }
global.updateInvoice = async function () { return { number_warning: '' } }
global.refreshLedger = async function () {}
global.fetchInvoices = async function () { return { items: [], duplicates: [] } }

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8'), { filename: 'modal-guard.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

const run = (code) => vm.runInThisContext(code)
run('bindLedgerEvents()')   // 注册 document 的 keydown/click

const modal = () => $('invoiceEditModal')
const batch = () => $('batchReimburserModal')
const drawer = () => $('duplicateDrawer')
const confirm = () => $('confirmModal')
function reset() {
  nativeConfirmCalls = 0
  run('closeEdit(); closeBatchReimburser(); selectedInvoices.clear(); answerConfirm(false)')
  confirm().hidden = true
}
function esc() {
  keyHandlers.forEach((fn) => fn({ key: 'Escape', target: { closest: () => null } }))
}
function clickOverlay(el) {
  // 真实场景里点遮罩，event.target 就是弹窗根节点本身
  el.fire('click', { target: { id: el.id } })
  clickHandlers.forEach((fn) => fn({ target: { id: el.id, closest: () => null } }))
}
/** 模拟点 document 上某个按钮：closest 只对指定选择器返回带该 id 的对象 */
function clickButton(id) {
  clickHandlers.forEach((fn) => fn({
    target: { closest: (sel) => (sel === '#' + id ? { id } : null) }
  }))
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

;(async () => {
  console.log('--- 快照：粘贴直改 value 也算改过，改回原样不算 ---')
  reset()
  run("openForm({ id: 5, number: 'N1', code: 'C1', kind: '数电票', issue_date: '2026-11-20', total: '10.00', reimburser: '张三' })")
  check('打开即建立快照', run('!!editSnapshot'), true)
  check('没改不算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), false)
  $('editNumber').value = 'N2'
  check('改一个字段算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), true)
  $('editNumber').value = 'N1'
  check('改回原样不算脏', run('fieldsDirty(editSnapshot, EDIT_FIELDS)'), false)

  console.log('\n--- 点边缘不关：遮罩、Esc 都不是关闭出口 ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = '半截号码'
  clickOverlay(modal())
  esc()
  check('点遮罩后弹窗还在', modal().hidden, false)
  check('按 Esc 后弹窗还在', modal().hidden, false)
  check('点边缘不弹确认框', confirm().hidden, true)

  reset()
  run('selectedInvoices.add(1); fillReimburserForSelected()')
  $('batchReimburserInput').value = '李四'
  clickOverlay(batch())
  esc()
  check('批量弹窗点边缘也不关', batch().hidden, false)

  reset()
  run('openDrawer()')
  clickOverlay(drawer())
  esc()
  check('只读抽屉点边缘也不关', drawer().hidden, false)
  run('closeDrawer()')

  console.log('\n--- 按钮是唯一出口：没改直接关，改过弹确认框 ---')
  reset()
  run('openForm(null)')
  clickButton('cancelEditBtn')
  await flush()
  check('没改过：点取消直接关', modal().hidden, true)
  check('没改过：不弹确认框', confirm().hidden, true)

  reset()
  run('openForm(null)')
  $('editNumber').value = '半截号码'
  const closing = run('requestCloseEdit()')
  await flush()
  check('改过后弹确认框', confirm().hidden, false)
  check('确认框带说明文案', /关闭后这些改动会丢失/.test($('confirmMessage').textContent), true)
  check('底层弹窗还没关', modal().hidden, false)
  check('没有调用原生 confirm', nativeConfirmCalls, 0)
  clickButton('confirmKeepBtn')
  await closing
  check('继续填写：底层弹窗留着', modal().hidden, false)
  check('继续填写：确认框收起', confirm().hidden, true)

  const closing2 = run('requestCloseEdit()')
  await flush()
  clickButton('confirmDiscardBtn')
  await closing2
  check('放弃内容：底层弹窗关闭', modal().hidden, true)
  check('放弃内容：确认框收起', confirm().hidden, true)
  check('放弃内容：快照清空', run('editSnapshot'), null)

  console.log('\n--- 确认框本身也只能靠按钮关 ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = 'N3'
  const closing3 = run('requestCloseEdit()')
  await flush()
  clickOverlay(confirm())
  esc()
  await flush()
  check('确认框点遮罩 / Esc 都不收起', confirm().hidden, false)
  clickButton('confirmKeepBtn')
  await closing3
  check('确认框靠按钮才收起', confirm().hidden, true)

  console.log('\n--- 连点不叠层 ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = 'N4'
  const p1 = run('openConfirm("第一层")')
  const p2 = run('openConfirm("第二层")')
  check('连点复用同一个 Promise', p1 === p2, true)
  check('文案不被第二次覆盖', $('confirmMessage').textContent, '第一层')
  run('answerConfirm(false)')
  await p1

  console.log('\n--- 批量补录弹窗同样走确认 ---')
  reset()
  run('selectedInvoices.add(1)')
  run('fillReimburserForSelected()')
  check('打开时快照为空', run('fieldsDirty(batchSnapshot, [["reimburser", "batchReimburserInput"]])'), false)
  $('batchReimburserInput').value = '李四'
  const batchClosing = run('requestCloseBatchReimburser()')
  await flush()
  check('批量弹窗也弹确认框', confirm().hidden, false)
  clickButton('confirmKeepBtn')
  await batchClosing
  check('批量弹窗取消后留着', batch().hidden, false)
  const batchClosing2 = run('requestCloseBatchReimburser()')
  await flush()
  clickButton('confirmDiscardBtn')
  await batchClosing2
  check('批量弹窗确认后关闭', batch().hidden, true)

  console.log('\n--- 保存成功不再误弹 ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = 'N9'
  await run('saveEdit()')
  check('保存后弹窗已关', modal().hidden, true)
  check('保存后快照清空', run('editSnapshot'), null)
  nativeConfirmCalls = 0
  await run('requestCloseEdit()')
  check('保存后再关不弹确认框', confirm().hidden, true)
  check('保存后再关不退回原生 confirm', nativeConfirmCalls, 0)

  console.log('\n--- 页面接线 ---')
  const app = fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8')
  check('关闭/取消按钮接保护', /closeEditBtn'\) \|\| event\.target\.closest\('#cancelEditBtn'\)\) return requestCloseEdit/.test(app), true)
  check('批量按钮接保护', /cancelBatchReimburserBtn'\)[\s\S]{0,80}requestCloseBatchReimburser/.test(app), true)
  check('确认框两个按钮接上', /confirmDiscardBtn[\s\S]{0,160}answerConfirm\(true\)[\s\S]{0,160}confirmKeepBtn/.test(app), true)
  check('真正关闭的 closeEdit 清快照', /function closeEdit\(\)[\s\S]{0,120}editSnapshot = null/.test(app), true)
  check('放弃确认走页面内确认框', /await allowDiscard\(fieldsDirty\(editSnapshot/.test(app), true)
  // 边缘关闭的监听一个都不许回来
  check('不再有遮罩点击关闭', !/addEventListener\('click'[\s\S]{0,80}event\.target\.id === '(invoiceEditModal|batchReimburserModal|duplicateDrawer|confirmModal)'/.test(app), true)
  check('keydown 里不再有 Escape 关窗', !/Escape'\)[\s\S]{0,200}(requestCloseEdit|requestCloseBatchReimburser|answerConfirm)/.test(app.slice(app.indexOf('function bindLedgerEvents'))), true)
  const guard = fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8')
  check('保护模块不再用原生 confirm', !/(^|[^A-Za-z])confirm\(/.test(guard), true)

  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
  check('保护模块在 app 之前加载', html.indexOf('/modal-guard.js') < html.indexOf('/ledger-app.js'), true)
  check('确认框有独立节点', /id="confirmModal" class="modal confirm-modal"/.test(html), true)
  const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8')
  check('确认框层级盖住表单弹窗', /\.confirm-modal \{ z-index: 70; \}/.test(css), true)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
