/**
 * 弹窗关闭保护回归。
 *
 * 数据录入弹窗误点遮罩或按 Esc 不该把填了一半的内容丢掉：
 * 没改过直接关，改过弹页面内确认框（不用浏览器原生 confirm，样式跟页面不搭）。
 * 只读抽屉不在此列。
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
run('bindLedgerEvents()')   // 注册 document 的 keydown/click，Esc 和按钮路径才会挂上

const modal = () => $('invoiceEditModal')
const batch = () => $('batchReimburserModal')
const confirm = () => $('confirmModal')
function reset() {
  nativeConfirmCalls = 0
  run('closeEdit(); closeBatchReimburser(); selectedInvoices.clear(); answerConfirm(false)')
  confirm().hidden = true
}
function esc() {
  keyHandlers.forEach((fn) => fn({ key: 'Escape', target: { closest: () => null } }))
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

  console.log('\n--- 没改直接关，不弹确认框 ---')
  reset()
  run('openForm(null)')
  await run('requestCloseEdit()')
  check('没改过直接关', modal().hidden, true)
  check('没改过不弹确认框', confirm().hidden, true)
  check('全程没退回原生 confirm', nativeConfirmCalls, 0)

  console.log('\n--- 改过后弹页面内确认框，不用原生 confirm ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = '半截号码'
  const closing = run('requestCloseEdit()')
  await flush()
  check('改过后弹确认框', confirm().hidden, false)
  check('确认框带着说明文案', /关闭后这些改动会丢失/.test($('confirmMessage').textContent), true)
  check('底层弹窗还没关', modal().hidden, false)
  clickButton('confirmKeepBtn')
  await closing
  check('点继续填写：底层弹窗留着', modal().hidden, false)
  check('点继续填写：确认框收起', confirm().hidden, true)
  check('点继续填写：快照还在', run('!!editSnapshot'), true)
  check('没有调用原生 confirm', nativeConfirmCalls, 0)

  console.log('\n--- 点放弃内容才关窗 ---')
  const closing2 = run('requestCloseEdit()')
  await flush()
  check('再次弹确认框', confirm().hidden, false)
  clickButton('confirmDiscardBtn')
  await closing2
  check('点放弃：底层弹窗关闭', modal().hidden, true)
  check('点放弃：确认框收起', confirm().hidden, true)
  check('点放弃：快照清空', run('editSnapshot'), null)

  console.log('\n--- Esc 与确认框叠层：Esc = 继续填写 ---')
  reset()
  run('openForm(null)')
  $('editCode').value = '1234567890'
  const closing3 = run('requestCloseEdit()')
  await flush()
  esc()
  await closing3
  check('Esc 让确认框答继续填写', modal().hidden, false)
  check('Esc 收起确认框', confirm().hidden, true)

  console.log('\n--- 确认框点遮罩同样 = 继续填写；连点不叠层 ---')
  reset()
  run('openForm(null)')
  $('editNumber').value = 'N3'
  const closing4 = run('requestCloseEdit()')
  await flush()
  run("answerConfirm(false)")   // 等价于点确认框遮罩
  await closing4
  check('遮罩点击后底层弹窗留着', modal().hidden, false)

  reset()
  run('openForm(null)')
  $('editNumber').value = 'N4'
  const p1 = run('openConfirm("第一层")')
  const p2 = run('openConfirm("第二层")')
  check('连点复用同一个 Promise', p1 === p2, true)
  check('文案不被第二次覆盖', $('confirmMessage').textContent, '第一层')
  run('answerConfirm(false)')
  await p1

  console.log('\n--- 批量补录弹窗同样受保护 ---')
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
  check('新增弹窗遮罩接保护', /invoiceEditModal'\)[\s\S]{0,120}requestCloseEdit\(\)/.test(app), true)
  check('批量弹窗遮罩接保护', /batchReimburserModal'\)[\s\S]{0,120}requestCloseBatchReimburser\(\)/.test(app), true)
  check('关闭/取消按钮接保护', /closeEditBtn'\) \|\| event\.target\.closest\('#cancelEditBtn'\)\) return requestCloseEdit/.test(app), true)
  const escStart = app.indexOf("confirmModal').hidden) return answerConfirm(false)")
  const escBlock = app.slice(escStart - 80, escStart + 320)
  check('Esc 接保护且确认框优先',
    escBlock.indexOf('confirmModal') < escBlock.indexOf('batchReimburserModal') &&
    escBlock.indexOf('batchReimburserModal') < escBlock.indexOf('requestCloseEdit'), true)
  check('确认框两个按钮接上', /confirmDiscardBtn[\s\S]{0,160}answerConfirm\(true\)[\s\S]{0,160}confirmKeepBtn/.test(app), true)
  check('确认框遮罩 = 继续填写', /confirmModal'\)[\s\S]{0,120}answerConfirm\(false\)/.test(app), true)
  check('真正关闭的 closeEdit 清快照', /function closeEdit\(\)[\s\S]{0,120}editSnapshot = null/.test(app), true)
  // 删除、清理那些确认仍用原生 confirm，这里只管「放弃未保存内容」这一条
  const guard = fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8')
  check('保护模块不再用原生 confirm', !/(^|[^A-Za-z])confirm\(/.test(guard), true)
  check('放弃确认走页面内确认框', /await allowDiscard\(fieldsDirty\(editSnapshot/.test(app), true)

  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
  check('保护模块在 app 之前加载', html.indexOf('/modal-guard.js') < html.indexOf('/ledger-app.js'), true)
  check('确认框有独立节点', /id="confirmModal" class="modal confirm-modal"/.test(html), true)
  check('确认框复用现有按钮样式', /id="confirmDiscardBtn"[^>]*class="btn btn-danger"/.test(html), true)
  const css = fs.readFileSync(path.join(WEB, 'style.css'), 'utf8')
  check('确认框层级盖住表单弹窗', /\.confirm-modal \{ z-index: 70; \}/.test(css), true)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
