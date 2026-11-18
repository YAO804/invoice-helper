/**
 * 收票页结构回归测试：按意图分卡，删掉冗余入口。
 *
 *   node test/miniprogram/collect-page.test.js
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
const dir = path.join(__dirname, '../../miniprogram/pages/collect')
const wxml = fs.readFileSync(path.join(dir, 'collect.wxml'), 'utf8')
const js = fs.readFileSync(path.join(dir, 'collect.js'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'collect.wxss'), 'utf8')

console.log('--- 入口齐全（功能一个不砍）---')
const handlers = []
const bindRe = /bindtap="([^"]+)"/g
let m
while ((m = bindRe.exec(wxml)) !== null) handlers.push(m[1])
check('bindtap 入口集合', handlers.slice().sort(),
  ['onBatchScan', 'onImport', 'onScan', 'onSettings', 'onTransfer'])

const methods = new Set()
const methodRe = /^\s{2}(on[A-Za-z0-9_]+)\s*\(/gm
while ((m = methodRe.exec(js)) !== null) methods.add(m[1])
check('每个 bindtap 都有对应方法', handlers.every(function (h) { return methods.has(h) }), true)

console.log('\n--- 冗余入口已删除 ---')
check('无查看台账入口', /onLedger|查看台账/.test(wxml + js), false)
check('无 M0 技术验证入口', /onM0|M0 技术验证/.test(wxml + js), false)
check('无遗留 tech 样式', /\.tech/.test(wxss), false)
check('卡片数为连接/扫码/导入/归档四张', (wxml.match(/<view class="card">/g) || []).length, 4)

console.log('\n--- 说人话：导入与归档分得清 ---')
check('文件导入卡片在', wxml.indexOf('>文件导入<') >= 0, true)
check('文件归档卡片在', wxml.indexOf('>文件归档<') >= 0, true)
check('导入说明点明 XML 自动填全', wxml.indexOf('XML 能自动填全') >= 0, true)
check('导入说明点明 OFD/PDF 只取名', wxml.indexOf('OFD / PDF 只取到文件名') >= 0, true)
check('归档说明点明与导入的区别', wxml.indexOf('和上面的「文件导入」不同') >= 0, true)
const cards = wxml.split('<view class="card">').slice(1)
const importCard = cards.filter(function (c) { return c.indexOf('>文件导入<') >= 0 })[0] || ''
check('传原件按钮不在文件导入卡片内', /onTransfer|把原件发到电脑/.test(importCard), false)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
