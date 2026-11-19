/**
 * 台账页结构回归测试：三层排布（概览 / 筛选 / 列表）。
 *
 *   node test/miniprogram/list-layout.test.js
 *
 * 这一层守的是「别再塞回去」：统计不再四等分、最近录入不再单独占一张卡、
 * 列表项不放 12 位代码、批次号不上界面、空态要能一键去收票。
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
const dir = path.join(__dirname, '../../miniprogram/pages/list')
const wxml = fs.readFileSync(path.join(dir, 'list.wxml'), 'utf8')
const js = fs.readFileSync(path.join(dir, 'list.js'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'list.wxss'), 'utf8')

console.log('--- 事件与处理函数一一对应 ---')
const bindings = []
const bindRe = /bind(?:tap|input|change)="([^"]+)"/g
let m
while ((m = bindRe.exec(wxml)) !== null) bindings.push(m[1])

const methods = new Set()
const methodRe = /^\s{2}(on[A-Za-z0-9_]+)\s*\(/gm
while ((m = methodRe.exec(js)) !== null) methods.add(m[1])

check('每个绑定都有对应方法', bindings.every(function (h) { return methods.has(h) }), true)
check('bindtap 入口集合', Array.from(new Set(bindings)).sort(),
  ['onClearBatch', 'onClearCreated', 'onCollect', 'onConnect', 'onCreatedFromChange',
    'onCreatedToChange', 'onKeywordInput', 'onLatestCreated', 'onOpenDetail',
    'onReset', 'onSortChange', 'onToggleDuplicates', 'onToggleNeedFill'])

console.log('\n--- 概览：一屏说清有多少、值多少 ---')
check('张数与合计在概览卡', /\{\{total\}\}/.test(wxml) && /¥\{\{amountText\}\}/.test(wxml), true)
check('重复/待补录用可点 tag', /class="tag[^"]*"\s+bindtap="onToggleDuplicates"/.test(wxml), true)
check('待补录 tag 可点', /bindtap="onToggleNeedFill"/.test(wxml), true)
check('四等分统计条已移除', /class="stats"|stat-cell/.test(wxml + wxss), false)

console.log('\n--- 筛选：一个控件一行，不再堆在一起 ---')
check('最近录入是 pill 不是卡片', /class="pill[^"]*"\s+bindtap="onLatestCreated"/.test(wxml), true)
check('没有独立的最近录入卡片', /wx:if="\{\{latestCreatedAt\}\}"\s+class="card"/.test(wxml), false)
check('日期起止仍是 picker', (wxml.match(/<picker[^>]*mode="date"/g) || []).length, 2)
check('清除日期只在选了之后出现', /wx:if="\{\{createdFrom \|\| createdTo\}\}"/.test(wxml), true)
check('排序用短标签', /\{\{item\.short\}\}/.test(wxml), true)
const sortLabels = js.match(/short: '([^']+)'/g) || []
check('四个排序都有短标签', sortLabels.length, 4)
check('搜索框占位不提代码以外的内部词', /placeholder="搜索号码 \/ 报销人 \/ 金额"/.test(wxml), true)

console.log('\n--- 列表项：一眼看到号码、金额、谁报的 ---')
check('金额在首行', /class="inv-amt"/.test(wxml), true)
check('报销人是独立标签', /class="who[^"]*"/.test(wxml), true)
check('待补录报销人有独立配色', /who-need/.test(wxml + wxss), true)
check('列表项不放 12 位代码', /item\.code/.test(wxml), false)
check('录入时间用精简格式', /item\.createdShort/.test(wxml), true)
check('重复标记仍在', /badge-warn">重复/.test(wxml), true)

console.log('\n--- 文案与空态 ---')
check('界面不出现批次号概念', wxml.indexOf('批次') < 0, true)
check('空台账给去收票按钮', /去收票/.test(wxml) && /bindtap="onCollect"/.test(wxml), true)
check('筛选空结果给清空按钮', /没有匹配的发票/.test(wxml) && /清空筛选条件/.test(wxml), true)
check('未连接仍有去连接入口', /bindtap="onConnect"/.test(wxml), true)
check('页脚只说电脑端维护', /请在电脑端网页操作/.test(wxml), true)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
