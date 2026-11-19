/**
 * 台账表格行渲染测试。
 *
 * 这一版为了「一行装下」重排了单元格：录入时间拆两行、重复标移到号码下面。
 * 也是这一版去掉了「录入批次」列——用户看不懂批次号，筛选改用录入时间。
 * 联调时最容易出的问题是拆行时丢了信息或被截断后无法回看，
 * 所以这里逐列断：信息还在、title 还在、列数没变。
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
function el(id) {
  if (!elements[id]) elements[id] = { id, innerHTML: '', textContent: '', hidden: true }
  return elements[id]
}
global.document = { getElementById: el, addEventListener() {} }

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(WEB, file), 'utf8'), { filename: file })
}

load('render.js')
load('time.js')
load('ledger-render.js')

const row = {
  id: 7,
  number: '26932000001295659876',
  code: '044031900111',
  kind: '数电票',
  issue_date: '2026-08-02',
  total: '1288.00',
  reimburser: '张三',
  batch: 'B20261118-093729-174',
  created_at: '2026-11-18 09:10:18',
  duplicate: true,
  need_fill: false
}

function render(items, selected) {
  el('invoiceBody').innerHTML = ''
  vm.runInThisContext(
    'renderInvoiceTable(' + JSON.stringify(items) + ', new Set(' + JSON.stringify([...(selected || [])]) + '))'
  )
  return el('invoiceBody').innerHTML
}

const html = render([row], [7])

/* 1. 列数没变：仍然是 9 个单元格，否则表头和行会对不齐 */
check('一行 9 个单元格', (html.match(/<td/g) || []).length, 9)

/* 2. 录入时间拆成日期 + 时间两行，完整值留在 title */
check('录入时间拆行', html.includes('2026-08-02'), true)
check('录入时间第二行是时间', html.includes('<div class="muted tiny">09:10:18</div>'), true)
check('录入时间有 title', html.includes('title="2026-11-18 09:10:18"'), true)

/* 3. 重复标移到号码下面，不再向右撑宽 */
check('标在 cell-badges 里', html.includes('<div class="cell-badges"><span class="badge dup">重复</span></div>'), true)
check('号码列带 col-number', html.includes('class="col-number"'), true)

/* 4. 批次列已删掉：批次号不再出现在任何单元格里 */
check('不再有 col-batch', html.includes('col-batch'), false)
check('批次号不再渲染', html.includes('B20261118-093729-174'), false)

/* 5. 号码/代码可复制，文字包在 copy-text 里才能做省略号 */
check('号码包了 copy-text', html.includes('<span class="copy-text">26932000001295659876</span>'), true)
check('复制提示带原值', html.includes('title="点击复制 26932000001295659876"'), true)
check('代码也包了 copy-text', html.includes('<span class="copy-text">044031900111</span>'), true)

/* 6. 金额右对齐靠 num 类 */
check('金额列带 num', html.includes('class="col-total num"'), true)

/* 7. 每列都带上了列宽用的 class，CSS 才对得上 */
for (const name of ['col-check', 'col-number', 'col-code', 'col-kind', 'col-issued', 'col-total', 'col-created', 'col-actions']) {
  check('存在列 ' + name, html.includes('class="' + name), true)
}

/* 8. 转义：号码里的引号不能逃出属性 */
const risky = Object.assign({}, row, { number: 'A"B', code: 'C<D>' })
const riskyHtml = render([risky], [])
check('属性里的引号被转义', riskyHtml.includes('data-copy="A&quot;B"'), true)
check('代码里的尖括号被转义', riskyHtml.includes('C&lt;D&gt;'), true)

/* 9. 同时有重复和待补录时两个标都出来 */
const both = Object.assign({}, row, { need_fill: true })
const bothHtml = render([both], [])
check('两个标都在同一行', bothHtml.includes('badge dup') && bothHtml.includes('badge fill'), true)

/* 10. 没有 created_at 时不要渲染出空 div */
const noTime = Object.assign({}, row, { created_at: '' })
const noTimeHtml = render([noTime], [])
check('无录入时间不产生空行', noTimeHtml.includes('<div class="muted tiny">'), false)

/* 11. 空列表占位要跨 9 列 */
check('空列表 colspan 为 9', render([], []), '<tr><td colspan="9" class="empty">没有匹配的发票</td></tr>')

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
if (fail) process.exitCode = 1
