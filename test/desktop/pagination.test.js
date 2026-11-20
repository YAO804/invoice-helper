/**
 * 台账列表分页：页脚文案、边界按钮、翻页与筛选的交互语义。
 *
 * 两万行时列表一次返回 4.7MB，浏览器渲染会卡住，所以列表改成每页 20 条。
 * 这里守的是几个容易退化的点：
 * - 只有一页时不该出现「1 / 1」
 * - 首尾页对应的按钮要禁用，不能看起来还能点
 * - 换筛选条件回第 1 页，但单纯翻页不能把已经勾上的票清掉
 *
 *   node test/desktop/pagination.test.js
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

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(WEB, file), 'utf8'), { filename: file })
}

load('render.js')
load('time.js')
load('suggest.js')
load('ledger-api.js')
load('ledger-render.js')
load('modal-guard.js')
load('form-validate.js')
load('ledger-app.js')

const run = (code) => vm.runInThisContext(code)
const renderPager = (data) => run('renderInvoicePager(' + JSON.stringify(data) + ')')

console.log('--- 页脚文案 ---')
renderPager({ items: [], total: 45, page: 2, page_size: 20, page_count: 3 })
check('多页时显示', elements.invoicePager.hidden, false)
check('总数用筛选后的总条数，不是当前页条数', elements.pagerSummary.textContent, '共 45 张 · 每页 20 张')
check('页码位置', elements.pagerPosition.textContent, '2 / 3')

console.log('\n--- 边界按钮 ---')
renderPager({ items: [], total: 45, page: 1, page_size: 20, page_count: 3 })
check('第一页禁用首页', elements.pagerFirst.disabled, true)
check('第一页禁用上一页', elements.pagerPrev.disabled, true)
check('第一页可用下一页', elements.pagerNext.disabled, false)

renderPager({ items: [], total: 45, page: 3, page_size: 20, page_count: 3 })
check('最后一页禁用下一页', elements.pagerNext.disabled, true)
check('最后一页禁用末页', elements.pagerLast.disabled, true)
check('最后一页可用上一页', elements.pagerPrev.disabled, false)

console.log('\n--- 只有一页时整条隐藏 ---')
renderPager({ items: [], total: 8, page: 1, page_size: 20, page_count: 1 })
check('单页隐藏分页条', elements.invoicePager.hidden, true)
// 后端越界贴回有效页时，前端拿到的 page 可能超出 page_count，不能显示成 9 / 3
renderPager({ items: [], total: 8, page: 9, page_size: 20, page_count: 1 })
check('页码超出总页数时贴回最后一页', elements.pagerPosition.textContent, '1 / 1')

console.log('\n--- 请求参数 ---')
run('invoicePage = 3')
const params = run('buildInvoiceParams()')
check('带上页码', params.get('page'), '3')
check('带上每页条数', params.get('page_size'), '20')

console.log('\n--- 换筛选回第一页，翻页不清选中 ---')
run("invoicePage = 4; knownInvoiceIds.clear(); resetInvoiceView()")
check('换筛选条件后回到第 1 页', run('invoicePage'), 1)
check('换筛选条件后清掉旧的已见 id', run('knownInvoiceIds.size'), 0)

// 第 1 页勾了 id=1，翻到第 2 页（id=3）不该把 1 清掉，否则跨页批量操作没法用
run("selectedInvoices = new Set([1]); knownInvoiceIds.clear()")
run("syncSelected([{ id: 1 }]); syncSelected([{ id: 3 }])")
check('翻页后上一页的勾选还在', run('Array.from(selectedInvoices)'), [1])

// 换筛选后只见过 id=3，之前勾的 1 属于另一份列表，要清掉
run("knownInvoiceIds.clear(); syncSelected([{ id: 3 }])")
check('换筛选后旧勾选清掉', run('Array.from(selectedInvoices)'), [])

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
process.exit(fail === 0 ? 0 : 1)
