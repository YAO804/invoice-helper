/**
 * 台账页「已选 N 张 · 合计 ¥X」的金额计算与渲染回归。
 *
 * 网页没有构建步骤，这里直接把 ledger-render.js 当脚本加载，
 * 用假的 $ 提供元素对象，验证求和口径与文案。
 *
 *   node test/desktop/ledger-render.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const elements = {}
global.$ = function (id) {
  if (!elements[id]) elements[id] = { textContent: '', hidden: true }
  return elements[id]
}

const source = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-render.js'), 'utf8')
vm.runInThisContext(source, { filename: 'ledger-render.js' })

check('解析两位小数', toCents('287.61'), 28761)
check('解析一位小数', toCents('287.6'), 28760)
check('解析整数', toCents('288'), 28800)
check('空金额算 0', toCents(''), 0)
check('空白算 0', toCents('   '), 0)
check('垃圾值算 0', toCents('abc'), 0)
check('Undefined 算 0', toCents(undefined), 0)
check('千分位逗号也能解析', toCents('1,234.56'), 123456)

check('两位分', money(5), '¥0.05')
check('整数元', money(100), '¥1.00')
check('千分位', money(298234), '¥2,982.34')
check('百万级', money(123456789), '¥1,234,567.89')
check('零', money(0), '¥0.00')

const items = [
  { id: 1, total: '287.61' },
  { id: 2, total: '284.42' },
  { id: 3, total: '273.07' },
  { id: 4, total: '' }
]

renderSelectionSummary(items, new Set([1, 2, 3]))
check('选中张数', elements.invoiceSelectedCount.textContent, '已选 3 张')
check('合计金额', elements.invoiceSelectedTotal.textContent, '合计 ¥845.10')
check('有选中时显示合计', elements.invoiceSelectedTotal.hidden, false)

// 金额为空的行计入张数但不计入合计，必须提示，否则用户以为合计是全额
renderSelectionSummary(items, new Set([1, 4]))
check('含空金额时的提示', elements.invoiceSelectedTotal.textContent, '合计 ¥287.61（1 张无金额）')

renderSelectionSummary(items, new Set([1, 2, 3, 4]))
check('空金额不参与求和', elements.invoiceSelectedTotal.textContent, '合计 ¥845.10（1 张无金额）')

// 浮点直接相加会得到 0.30000000000000004，按分算才是 30
renderSelectionSummary([{ id: 9, total: '0.10' }, { id: 10, total: '0.20' }], new Set([9, 10]))
check('分位求和不吃浮点误差', elements.invoiceSelectedTotal.textContent, '合计 ¥0.30')

renderSelectionSummary(items, new Set())
check('没选中时张数归零', elements.invoiceSelectedCount.textContent, '已选 0 张')
check('没选中时隐藏合计', elements.invoiceSelectedTotal.hidden, true)
check('没选中时清空合计文案', elements.invoiceSelectedTotal.textContent, '')

renderSelectionSummary([], new Set())
check('空列表不报错', elements.invoiceSelectedCount.textContent, '已选 0 张')

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
