/**
 * 导入预览的重复处理回归。
 *
 * 重复行不允许静默跳过：必须在预览里标出来、写明跟哪张撞了，
 * 并且把「跳过」和「全部导入」两个出口都交给用户自己选。
 *
 *   node test/desktop/import-preview.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

function contains(name, html, needle) {
  check(name + '（含「' + needle + '」）', html.includes(needle), true)
}

function absent(name, html, needle) {
  check(name + '（不该有「' + needle + '」）', html.includes(needle), false)
}

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const elements = {}
// render.js 里 $ 就是 document.getElementById 的简写，所以假的是 document
global.document = {
  getElementById: function (id) {
    if (!elements[id]) elements[id] = { textContent: '', innerHTML: '', hidden: true }
    return elements[id]
  }
}

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/time.js'), 'utf8'), { filename: 'time.js' })
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/render.js'), 'utf8'), { filename: 'render.js' })
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-render.js'), 'utf8'),
  { filename: 'ledger-render.js' }
)

function item(number, reimburser, status, extra) {
  return Object.assign({
    invoice: {
      number: number,
      code: '03200' + (number || 'X'),
      kind: '电子发票',
      issue_date: '2024-10-28',
      reimburser: reimburser,
      total: '113.00'
    },
    status: status,
    message: status === 'duplicate' ? '发票代码与号码都已存在' : status === 'invalid' ? '缺少发票号码' : ''
  }, extra || {})
}

function previewOf(items) {
  return {
    total: items.length,
    new_count: items.filter((i) => i.status === 'new').length,
    duplicate_count: items.filter((i) => i.status === 'duplicate').length,
    invalid_count: items.filter((i) => i.status === 'invalid').length,
    date_warning_count: items.filter((i) => i.warning).length,
    number_warning_count: items.filter((i) => i.number_warning).length,
    items: items
  }
}

const withDup = previewOf([
  item('N001', '甲', 'new'),
  item('N002', '乙', 'duplicate', {
    conflict: { id: 12, reimburser: '老张', total: '113.00' },
    conflict_from: 'ledger'
  }),
  item('N002', '丙', 'duplicate', {
    conflict: { id: 0, reimburser: '乙', total: '113.00' },
    conflict_from: 'file'
  }),
  item('', '丁', 'invalid')
])

renderImportPreview(withDup, '')
let html = elements.importPreview.innerHTML

contains('有重复时给出警告条', html, 'dup-banner')
contains('警告条说清张数', html, '发现 2 张重复发票')
contains('警告条告诉用户要自己决定', html, '跳过它们，还是照样全部导入')
contains('缺号码也说明不会导入', html, '缺发票号码的 1 张无论选哪种都不会导入')
check('重复行整行标红', html.includes('preview-row duplicate'), true)
check('无效行单独标记', html.includes('preview-row invalid'), true)
contains('写明撞的是台账哪一张', html, '台账 #12 老张 ¥113.00 重复')
contains('写明是本文件内部重复', html, '与本文件前面的行重复')

contains('跳过出口带张数', html, '跳过 2 张重复，导入 1 张')
contains('全量出口带张数', html, '全部导入（含 2 张重复）')
check('两个出口的按钮 id 都在', html.includes('id="confirmImportBtn"') && html.includes('id="importAllBtn"'), true)
contains('取消始终在', html, 'id="cancelImportBtn"')

contains('状态列中文：新增', html, '<td>新增</td>')
contains('状态列中文：重复', html, '<td>重复</td>')
contains('状态列中文：缺号码', html, '<td>缺号码</td>')
absent('不再直接甩英文状态', html, '<td>duplicate</td>')
absent('不再直接甩英文状态（invalid）', html, '<td>invalid</td>')

// 缺列会让用户没法核对，甚至看不出「号码列填成了代码」这种串列
contains('表头有发票代码', html, '<th>发票代码</th>')
contains('表头有票种', html, '<th>票种</th>')
contains('表头有开票日期', html, '<th>开票日期</th>')
contains('发票代码值渲染出来', html, '<td class="muted">03200N001</td>')
contains('票种值渲染出来', html, '<td>电子发票</td>')
contains('开票日期值渲染出来', html, '<td>2024-10-28</td>')

const clean = previewOf([item('N003', '甲', 'new'), item('N004', '乙', 'new')])
renderImportPreview(clean, '')
html = elements.importPreview.innerHTML
absent('没有重复时不弹警告', html, 'dup-banner')
absent('没有重复时不提供全量出口', html, 'importAllBtn')
contains('没有重复时直接确认', html, '确认导入 2 张')
absent('没有重复时不给「只看重复」', html, 'only-duplicates')

// 只有重复行的文件：跳过出口会显示「导入 0 张」，仍然要能一眼看出结果
const onlyDup = previewOf([item('N005', '甲', 'duplicate', { conflict_from: 'file' })])
renderImportPreview(onlyDup, '')
contains('全是重复时出口说清导入 0 张', elements.importPreview.innerHTML, '导入 0 张')

// 「只看重复」：重复行可能排在 50 行之外，不提供入口等于把重复藏起来
renderImportPreview(withDup, '')
contains('提供只看重复入口', elements.importPreview.innerHTML, '只看重复 2')
renderImportPreview(withDup, 'duplicate')
html = elements.importPreview.innerHTML
contains('只看重复时变成显示全部', html, '显示全部')
check('只看重复时只渲染重复行', (html.match(/preview-row/g) || []).length, 2)
absent('只看重复时不渲染新增行', html, '>N001<')
// 筛选后序号要指向文件里的原位置（第 2、3 条），不能从头数成 1、2
check('只看重复时序号仍是原始位置', /<td class="muted">2<\/td>/.test(html) && /<td class="muted">3<\/td>/.test(html), true)

// 60 行文件：必须承认自己只显示了一部分
const many = previewOf(Array.from({ length: 60 }, (_, i) => item('M' + i, '甲', 'new')))
renderImportPreview(many, '')
contains('截断要明写', elements.importPreview.innerHTML, '共 60 行，仅显示前 50 行')
check('最多渲染 50 行', (elements.importPreview.innerHTML.match(/preview-row/g) || []).length, 50)

// 截断时位数可疑行可能排在 50 行之外，得告诉用户还有个筛选入口
const manyWithBadNumber = previewOf(Array.from({ length: 60 }, (_, i) =>
  i === 0 ? Object.assign(item('M0', '甲', 'new'), { number_warning: '位数可疑' }) : item('M' + i, '甲', 'new')))
renderImportPreview(manyWithBadNumber, '')
contains('截断提示指出位数异常可筛', elements.importPreview.innerHTML, '点上方「只看位数异常」核对')

// 认不出格式的日期不拦导入，但必须说清后果，否则用户在日期筛选里找不到票
const oddDate = previewOf([
  item('N010', '甲', 'new'),
  Object.assign(item('N011', '乙', 'new'), {
    warning: '开票日期「05-06-24」认不出格式，已原样保留，按开票日期筛选时可能漏掉这张'
  })
])
renderImportPreview(oddDate, '')
html = elements.importPreview.innerHTML
contains('汇总里有日期待核对', html, '日期待核对 1')
contains('行内显示日期提示', html, 'date-hint')
contains('提示说清会被筛掉', html, '按开票日期筛选时可能漏掉这张')
contains('表格下方给出后果与改法', html, '台账按开票日期筛选时可能看不到它们')
contains('给出标准写法示例', html, '2024-10-28')

renderImportPreview(previewOf([item('N012', '甲', 'new')]), '')
absent('日期都正常时不提示', elements.importPreview.innerHTML, '日期待核对')
absent('日期都正常时不出现说明', elements.importPreview.innerHTML, 'date-note')

// 页面接线：三种决策都要有处理，且提交时把口径带给后端
const app = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-app.js'), 'utf8')
contains('确认走跳过口径', app, 'confirmImport()')
contains('全部导入有独立处理', app, 'importAllIncludingDuplicates()')
contains('只看重复有处理', app, 'only-duplicates')
contains('全量导入前二次确认', app, '需要去「查重」里手工清理')

const api = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-api.js'), 'utf8')
contains('提交带 skip_duplicates', api, 'skip_duplicates=')
check('跳过与全量分别发 1/0', api.includes("skipDuplicates ? '1' : '0'"), true)

// 号码填成代码：模板写反过一次，用户照着填反过一次。
// 位数是可核验的客观依据，提示要说清后果（判重键跟着反）和下一步动作。
const swapped = previewOf([
  item('00813251', '甲', 'new'),
  Object.assign(item('032002300911', '乙', 'new'), {
    number_warning: '发票号码 12 位像发票代码、发票代码 8 位像发票号码，两列可能填反了；判重按「代码+号码」算，填反后查重会失效'
  }),
  Object.assign(item('1234567', '丙', 'new'), {
    number_warning: '发票号码 7 位，不像常见的 8 位或数电票 20 位，请核对是否填成了发票代码'
  })
])
renderImportPreview(swapped, '')
html = elements.importPreview.innerHTML
contains('汇总里有号码待核对', html, '号码待核对 2')
contains('行内显示位数提示', html, 'number-hint')
contains('行内说清是两列填反', html, '两列可能填反了')
check('可疑行整行标记', html.includes('preview-row new number-suspect'), true)
contains('表格下方说清真实位数', html, '发票号码应是 8 位')
contains('表格下方说清后果', html, '查重会失效')
contains('表格下方给下一步动作', html, '交换两列后重新上传')
contains('提供只看位数异常入口', html, '只看位数异常 2')
contains('提示不拦截导入', html, '确认导入 3 张')

renderImportPreview(swapped, 'number')
html = elements.importPreview.innerHTML
contains('筛选态下按钮变显示全部', html, '显示全部')
check('只看位数异常时只渲染可疑行', (html.match(/preview-row/g) || []).length, 2)
absent('只看位数异常时不渲染正常行', html, '>00813251<')
check('筛完序号仍是原始位置', /<td class="muted">2<\/td>/.test(html) && /<td class="muted">3<\/td>/.test(html), true)

renderImportPreview(clean, '')
absent('位数都正常时不提示', elements.importPreview.innerHTML, '号码待核对')
absent('位数都正常时不出现说明', elements.importPreview.innerHTML, 'number-note')
absent('位数都正常时不给筛选入口', elements.importPreview.innerHTML, 'only-number-warnings')

contains('位数异常筛选有页面接线', app, 'only-number-warnings')
contains('两个筛选入口共用互斥逻辑', app, 'toggleImportOnly')

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
