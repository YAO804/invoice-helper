/**
 * 报销人补录体验：一键复制、批量填写、历史建议、粘贴拆分。
 *
 *   node test/desktop/reimburser-fill.test.js
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
    id, textContent: '', innerHTML: '', value: '', checked: false, hidden: true, files: [],
    addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }

let alerts = []
let updates = []
let promptAnswer = ''
global.document = {
  getElementById: global.$,
  addEventListener() {},
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') }
}
global.window = {
  prompt() { return promptAnswer },
  refresh: null
}
global.alert = function (message) { alerts.push(message) }
global.confirm = function () { return true }
global.updateInvoice = async function (id, payload) { updates.push({ id, payload }) }
global.createInvoice = async function () {}
global.deleteInvoices = async function () {}
global.fetchInvoices = async function () { return { items: [], duplicates: [] } }

// 与 render.js 的 esc 等价；这里不加载整个 render.js，避免拖入无关 DOM 依赖
global.esc = function (value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => map[ch])
}

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-render.js'), 'utf8'), { filename: 'ledger-render.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

console.log('--- 粘贴解析 ---')
check('扫码串拆出号码/日期/金额',
  parsePastedInvoice('01,31,,26932000001877489821,10500.00,20261110,,277D'),
  { number: '26932000001877489821', issue_date: '2026-11-10', total: '10500.00' })
check('Excel 一行按列拆',
  parsePastedInvoice('N1\tC1\t数电票\t2026-08-01\t113.00\t张三'),
  { number: 'N1', code: 'C1', kind: '数电票', issue_date: '2026-08-01', total: '113.00', reimburser: '张三' })
check('单值不拦，走原生粘贴', parsePastedInvoice('张三'), null)
check('多行不解析', parsePastedInvoice('N1\nN2'), null)
check('空文本不解析', parsePastedInvoice('   '), null)
check('普通逗号句不误判', parsePastedInvoice('张三,李四'), null)

console.log('\n--- 建议池去重 ---')
check('去重后只剩两个', orderedValues(new Set(['张三', '李四', '张三'])).length, 2)
check('去重内容正确', orderedValues(new Set(['张三', '李四', '张三'])).sort(), ['张三', '李四'].sort())

console.log('\n--- 报销人单元格复制按钮 ---')
const withName = reimburserCell({ id: 1, reimburser: '张三' })
check('有值时给复制按钮', withName.indexOf('reimburser-copy') >= 0, true)
check('复制按钮带值', withName.indexOf('data-copy="张三"') >= 0, true)
check('仍保留点击编辑', withName.indexOf('edit-reimburser') >= 0, true)
const withoutName = reimburserCell({ id: 2, reimburser: '' })
check('待补录不给复制按钮', withoutName.indexOf('reimburser-copy') >= 0, false)
check('待补录仍可点击编辑', withoutName.indexOf('edit-reimburser') >= 0, true)

console.log('\n--- 建议列表填充 ---')
vm.runInThisContext("invoiceData = { items: [" +
  "{ id: 1, reimburser: '张三', kind: '数电票' }," +
  "{ id: 2, reimburser: '张三', kind: '普通发票' }," +
  "{ id: 3, reimburser: '', kind: '数电票' }" +
  '], duplicates: [] }')
refreshSuggestions()
check('报销人建议去重', elements.reimburserSuggestions.innerHTML, '<option value="张三"></option>')
check('票种建议去重', (elements.kindSuggestions.innerHTML.match(/<option/g) || []).length, 2)

console.log('\n--- 批量填报销人 ---')
alerts = []
vm.runInThisContext('selectedInvoices.clear()')
async function batchNoSelection() {
  await fillReimburserForSelected()
  check('没选中时提示', alerts, ['请先选择发票'])
}

async function batchFillsAll() {
  vm.runInThisContext('selectedInvoices.add(1); selectedInvoices.add(3)')
  vm.runInThisContext("invoiceData.items = [" +
    "{ id: 1, number: 'N1', code: '', kind: '数电票', issue_date: '2026-08-01', total: '1.00', reimburser: '' }," +
    "{ id: 3, number: 'N3', code: '', kind: '普通发票', issue_date: '2026-08-02', total: '2.00', reimburser: '王五' }" +
    ']')
  promptAnswer = '李四'
  updates = []
  await fillReimburserForSelected()
  check('两张都更新', updates.length, 2)
  check('整条替换带齐其余字段', updates[0].payload,
    { number: 'N1', code: '', kind: '数电票', issue_date: '2026-08-01', total: '1.00', reimburser: '李四' })
  check('覆盖原有报销人', updates[1].payload.reimburser, '李四')
}

batchNoSelection().then(batchFillsAll).then(function () {
  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}).catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
