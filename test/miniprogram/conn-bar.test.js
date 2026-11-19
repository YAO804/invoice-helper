/**
 * 连接状态条的结构回归。
 *
 *   node test/miniprogram/conn-bar.test.js
 *
 * 文案与状态由 connect-hint.test.js 守，这里只守「挂没挂上」：
 * 方案 A 最容易出的事故是新增页面忘了引用，于是四个页面又变成四套说法。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '../../miniprogram')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

console.log('--- 组件本身 ---')
const files = ['components/conn-bar/conn-bar.js', 'components/conn-bar/conn-bar.wxml',
  'components/conn-bar/conn-bar.wxss', 'components/conn-bar/conn-bar.json']
files.forEach(function (rel) {
  check('四件套齐全：' + path.basename(rel), exists(rel), true)
})

const barJs = read('components/conn-bar/conn-bar.js')
const barWxml = read('components/conn-bar/conn-bar.wxml')
const barJson = JSON.parse(read('components/conn-bar/conn-bar.json'))

check('声明成组件', barJson.component, true)
check('文案全部来自 connect-hint，组件里不写死状态字', barJs.indexOf('barView') >= 0, true)
check('点状态条直接去设置页', barJs.indexOf("'/pages/settings/settings'") >= 0, true)
check('已连接时不跳转（没什么要改的）', barJs.indexOf("status === 'ok'") >= 0, true)
check('定时重算「几分钟前」', barJs.indexOf('setInterval') >= 0, true)
check('卸载时清掉定时器（否则切页后还在跑）', barJs.indexOf('clearInterval') >= 0, true)
check('模板渲染徽标与细节', barWxml.indexOf('{{badge}}') >= 0 && barWxml.indexOf('{{detail}}') >= 0, true)
check('只在有动作时才画「›」', barWxml.indexOf('wx:if="{{action}}"') >= 0, true)

console.log('\n--- 全局注册与各页挂载 ---')
const appJson = JSON.parse(read('app.json'))
check('app.json 全局注册', !!appJson.usingComponents['conn-bar'], true)

const pages = ['pages/collect/collect.wxml', 'pages/list/list.wxml', 'pages/transfer/transfer.wxml',
  'pages/export/export.wxml']
pages.forEach(function (rel) {
  const wxml = read(rel)
  check(path.dirname(rel) + ' 挂了状态条', wxml.indexOf('<conn-bar') >= 0, true)
  check(path.dirname(rel) + ' 把 status 传下去', /<conn-bar[^>]*status=/.test(wxml), true)
})

// 详情页数据由台账页带过来，不需要单独探活；设置页本身就是连接页，顶部再挂一条状态条只是重复
check('详情页不挂状态条', read('pages/detail/detail.wxml').indexOf('<conn-bar') < 0, true)
check('设置页不挂状态条', read('pages/settings/settings.wxml').indexOf('<conn-bar') < 0, true)

console.log('\n--- 设置页的状态卡 ---')
const settingsWxml = read('pages/settings/settings.wxml')
const settingsJs = read('pages/settings/settings.js')
check('状态卡排在第一块（先看状态再谈怎么改）',
  settingsWxml.indexOf('status-card') >= 0 && settingsWxml.indexOf('status-card') < settingsWxml.indexOf('card-t'), true)
check('主按钮绑到 onPrimary', settingsWxml.indexOf('bindtap="onPrimary"') >= 0, true)
check('断开只在有地址时出现', settingsWxml.indexOf('{{hasBase') >= 0, true)
check('断开要二次确认，别一键清掉', settingsJs.indexOf('onDisconnect') >= 0 && settingsJs.indexOf('断开这台电脑') >= 0, true)
check('旧的「状态：已配置」不许回来', settingsWxml.indexOf('已配置') < 0, true)
check('状态文案仍然来自 connect-hint', settingsJs.indexOf('hint.cardView') >= 0, true)
// 只在「未连接」时给扫码，等于「连不上」时反而得先断开才能重扫——顺序反了
check('存过地址就常驻重扫入口（不按状态藏按钮）',
  settingsWxml.indexOf('bindtap="onScanConnect"') >= 0 &&
  settingsWxml.indexOf("hasBase && status != 'none'") >= 0, true)
check('断开仍在同一行（换电脑一步到位）',
  settingsWxml.indexOf('bindtap="onDisconnect"') >= 0, true)
// 三个动作拆两行会多占一行高度；合并后靠 status-actions 收紧内边距才放得下
check('三个动作共用一行（status-actions）', settingsWxml.indexOf('status-actions') >= 0, true)
check('收紧内边距的样式有定义',
  read('pages/settings/settings.wxss').indexOf('.status-actions .btn') >= 0, true)

console.log('\n--- 各页不再自己写一套状态 ---')
const transferWxml = read('pages/transfer/transfer.wxml')
check('传输页删掉了旧徽标', transferWxml.indexOf("{{connected ? '已连接' : '未连接'}}") < 0, true)
const collectWxml = read('pages/collect/collect.wxml')
check('收票页卡片不再重复写徽标', collectWxml.indexOf('{{statusBadge}}') < 0, true)
const exportJs = read('pages/export/export.js')
check('导出页的「已连接」不再只看存过地址', exportJs.indexOf('lanservice.probe()') >= 0, true)
check('导出页删掉了 address 即连接的判断', exportJs.indexOf('connected: !!base') < 0, true)

console.log('\n--- 未连接时只禁用需要电脑的操作 ---')
check('收票页给按钮加置灰类', collectWxml.indexOf('btn-off') >= 0, true)
check('页面用 ready 判断', collectWxml.indexOf('{{ready ?') >= 0, true)
check('置灰样式有定义', read('app.wxss').indexOf('.btn.btn-off') >= 0, true)
const collectJs = read('pages/collect/collect.js')
check('扫描/导入/归档都有前置拦截', (collectJs.match(/if \(!this\.requireReady\(\)\) return/g) || []).length >= 4, true)
check('拦截时给出下一步', collectJs.indexOf('还没连上电脑，先点顶部状态条去连接') >= 0, true)

console.log('\n' + (failCount === 0 ? '全部通过' : '失败 ' + failCount + ' 项'))
process.exit(failCount === 0 ? 0 : 1)
