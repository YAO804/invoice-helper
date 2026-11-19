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
    addEventListener() {}, setAttribute() {}, focus() {}, classList: { add() {}, remove() {} }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }

let alerts = []
let updates = []
global.document = {
  getElementById: global.$,
  addEventListener() {},
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') }
}
// 故意不提供 window.prompt：批量填写必须走页面内模态框，一旦退回原生弹窗这里就会抛错
global.window = { refresh: null }
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

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'time.js'), 'utf8'), { filename: 'time.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-render.js'), 'utf8'), { filename: 'ledger-render.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
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
check('报销人建议去重', suggestStore.reimburser, ['张三'])
check('票种建议去重（按拼音排序）', suggestStore.kind, ['普通发票', '数电票'])
check('建议不再塞进原生 datalist', elements.reimburserSuggestions, undefined)

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
  updates = []
  fillReimburserForSelected()
  check('走页面内模态框，不再用原生 prompt', elements.batchReimburserModal.hidden, false)
  check('提示写明本次张数', elements.batchReimburserHint.textContent.indexOf('2 张') >= 0, true)
  check('打开时输入框是空的', elements.batchReimburserInput.value, '')

  elements.batchReimburserInput.value = ' 李四 '
  await confirmBatchReimburser()
  check('提交后关闭弹窗', elements.batchReimburserModal.hidden, true)
  check('两张都更新', updates.length, 2)
  check('整条替换带齐其余字段', updates[0].payload,
    { number: 'N1', code: '', kind: '数电票', issue_date: '2026-08-01', total: '1.00', reimburser: '李四' })
  check('覆盖原有报销人', updates[1].payload.reimburser, '李四')
  check('输入两侧空格被裁掉', updates[0].payload.reimburser, '李四')
}

async function batchCancelKeepsData() {
  vm.runInThisContext('selectedInvoices.clear(); selectedInvoices.add(1)')
  updates = []
  fillReimburserForSelected()
  elements.batchReimburserInput.value = '不该保存'
  closeBatchReimburser()
  check('取消后关闭', elements.batchReimburserModal.hidden, true)
  check('取消不发请求', updates.length, 0)
}

async function batchEmptyClears() {
  // 上一次提交会走 refreshLedger，把 invoiceData 换成桩数据，这里重新铺一条
  vm.runInThisContext('selectedInvoices.clear(); selectedInvoices.add(1)')
  vm.runInThisContext("invoiceData.items = [" +
    "{ id: 1, number: 'N1', code: '', kind: '数电票', issue_date: '2026-08-01', total: '1.00', reimburser: '张三' }" +
    ']')
  updates = []
  fillReimburserForSelected()
  elements.batchReimburserInput.value = '   '
  await confirmBatchReimburser()
  check('留空表示清空', updates.length, 1)
  check('传给接口的是空串', updates[0].payload.reimburser, '')
}

console.log('\n--- 开票日期用日期选择器 ---')
// 原来是个文本框让用户手敲 YYYY-MM-DD：格式全靠自觉，敲成 2024/10/28 之后
// 后端按字符串比较日期筛选就悄悄失效。换成原生日期选择器，只到天。
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
check('开票日期是原生日期选择器', /id="editIssueDate"[^>]*type="date"/.test(html), true)
check('不再留手输格式提示', /id="editIssueDate"[^>]*placeholder/.test(html), false)

// 选择器只认 YYYY-MM-DD，台账里却存着 Excel 导入的原样字符串
check('已经是 ISO 的原样返回', dateInputValue('2026-11-18'), '2026-11-18')
check('斜杠日期归一', dateInputValue('2024/10/28'), '2024-10-28')
check('点号日期归一', dateInputValue('2024.10.28'), '2024-10-28')
check('八位数字归一', dateInputValue('20241028'), '2024-10-28')
check('带空白也认', dateInputValue('  2024/10/28  '), '2024-10-28')
check('认不出的脏数据给空（选择器填不进去）', dateInputValue('111111'), '')
check('空值给空', dateInputValue(''), '')
// 填不进去的旧值不能被静默抹掉：用户没重挑就原样存回
check('认不出的旧值保存时原样保留', dateSaveValue('111111', ''), '111111')
check('用户重挑了就用新日期', dateSaveValue('111111', '2026-03-01'), '2026-03-01')
check('用户清掉原本合法的日期就清空', dateSaveValue('2026-11-18', ''), '')

batchNoSelection().then(batchFillsAll).then(batchCancelKeepsData).then(batchEmptyClears).then(function () {
  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}).catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
