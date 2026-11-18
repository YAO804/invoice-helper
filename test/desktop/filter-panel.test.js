/**
 * 台账筛选面板：参数拼装与「已删掉的条件别再回来」。
 *
 * 2026-11-18 调整：去掉全局搜索与录入批次，改加录入时间起止；
 * 批次这个概念对用户没意义，筛选一律走录入时间。
 *
 *   node test/desktop/filter-panel.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log('PASS ' + name)
    return
  }
  fail++
  console.log('FAIL ' + name)
  console.log('  实际: ' + a)
  console.log('  期望: ' + e)
}

const elements = {}
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true,
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

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-api.js'), 'utf8'), { filename: 'ledger-api.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

const params = () => vm.runInThisContext('buildInvoiceParams()')

console.log('--- 查询参数 ---')
// 空面板只带排序
$('invSort').value = 'created'
let p = params()
check('空面板只有 sort', p.toString(), 'sort=created')

// 录入时间起止
$('invCreatedFrom').value = '2026-11-18'
$('invCreatedTo').value = '2026-11-18'
p = params()
check('录入时间起', p.get('created_from'), '2026-11-18')
check('录入时间止', p.get('created_to'), '2026-11-18')

// 不再发送 keyword / batch
$('invNumber').value = 'N001'
$('invReimburser').value = '张三'
$('invOnlyDuplicates').checked = true
p = params()
check('发票号码照旧', p.get('number'), 'N001')
check('报销人照旧', p.get('reimburser'), '张三')
check('仅看重复照旧', p.get('only_duplicates'), '1')
check('不再发送 keyword', p.has('keyword'), false)
check('不再发送 batch', p.has('batch'), false)

console.log('\n--- 筛选计数与重置 ---')
// 发票号码 + 报销人 + 录入时间起止 + 仅看重复 = 5
check('计数含录入时间两项与勾选', vm.runInThisContext('activeFilterCount()'), 5)

vm.runInThisContext('resetFilters()')
check('重置清空录入时间起', $('invCreatedFrom').value, '')
check('重置清空录入时间止', $('invCreatedTo').value, '')
check('重置清空发票号码', $('invNumber').value, '')
check('重置清空勾选', $('invOnlyDuplicates').checked, false)

console.log('\n--- 面板结构 ---')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
check('没有全局搜索', html.includes('全局搜索'), false)
check('没有 invKeyword', html.includes('invKeyword'), false)
check('没有录入批次筛选', html.includes('invBatchFilter'), false)
check('没有批次列', html.includes('col-batch'), false)
check('表头没有录入批次', html.includes('<th>录入批次</th>'), false)
check('有录入时间起', html.includes('id="invCreatedFrom"'), true)
check('有录入时间止', html.includes('id="invCreatedTo"'), true)
check('有最近录入卡片', html.includes('id="invLatestDate"'), true)
check('卡片文案不再叫批次', html.includes('最新批次'), false)

// 表头与行的列数必须对得上：colgroup 里 9 个 col，thead 里 9 个 th。
// 页面里还有文件列表等别的表，必须先定位到台账这张。
const tableStart = html.indexOf('<table class="invoice-table">')
const tableEnd = html.indexOf('</table>', tableStart)
const table = html.slice(tableStart, tableEnd)
const colgroup = table.slice(table.indexOf('<colgroup>'), table.indexOf('</colgroup>'))
const thead = table.slice(table.indexOf('<thead>'), table.indexOf('</thead>'))
check('colgroup 9 列', (colgroup.match(/<col /g) || []).length, 9)
// <th 会匹配到 <thead 本身，所以要带上后一个字符一起判断
check('表头 9 列', (thead.match(/<th[ >]/g) || []).length, 9)

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
if (fail) process.exitCode = 1
