/**
 * 电脑端时间展示回归测试。
 *
 *   node test/desktop/time-format.test.js
 *
 * 底线：不管电脑系统时区设成什么，界面上的时间都必须是北京东八区；
 * 已经是本地文本的时间不能被二次 +8。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { execFileSync } = require('child_process')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const WEB = path.join(__dirname, '../../desktop/web')
const source = fs.readFileSync(path.join(WEB, 'time.js'), 'utf8')

const context = { Date, String, Number, isNaN, RegExp, console }
vm.createContext(context)
vm.runInContext(source, context, { filename: 'time.js' })
const { beijingTime, beijingClock } = context

console.log('--- UTC 串换算成东八区 ---')
check('后端上传时间', beijingTime('2026-11-19T00:21:00Z'), '2026-11-19 08:21:00')
check('待取文件修改时间', beijingTime('2026-11-18T01:30:31Z'), '2026-11-18 09:30:31')
check('跨日边界', beijingTime('2026-11-18T16:30:00Z'), '2026-11-19 00:30:00')
check('跨月边界', beijingTime('2026-10-31T20:00:00Z'), '2026-11-01 04:00:00')

console.log('\n--- 已经带偏移的时间按绝对时刻换算 ---')
check('+08:00 原样', beijingTime('2026-11-19T08:21:00+08:00'), '2026-11-19 08:21:00')
check('-05:00 换算', beijingTime('2026-11-18T19:21:00-05:00'), '2026-11-19 08:21:00')

console.log('\n--- 不该被二次换算的输入 ---')
check('台账本地文本原样', beijingTime('2026-11-18 09:10:18'), '2026-11-18 09:10:18')
check('纯日期原样', beijingTime('2026-11-18'), '2026-11-18')
check('空串', beijingTime(''), '')
check('null', beijingTime(null), '')
check('undefined', beijingTime(undefined), '')

console.log('\n--- 异常与时间戳 ---')
check('解析不了就原样退还', beijingTime('2026-13-45T99:99:99Z'), '2026-13-45T99:99:99Z')
check('时间戳按北京时间格式化', beijingTime(0), '1970-01-01 08:00:00')
check('时钟串取时分秒', beijingClock(0), '08:00:00')
check('不传参取当前时间', /^\d{2}:\d{2}:\d{2}$/.test(beijingClock()), true)

console.log('\n--- 与系统时区无关 ---')
const script = `
const fs = require('fs'), vm = require('vm')
const ctx = { Date, String, Number, isNaN, RegExp }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(${JSON.stringify(path.join(WEB, 'time.js'))}, 'utf8'), ctx)
console.log(ctx.beijingTime('2026-11-19T00:21:00Z'))
`
const utcResult = execFileSync(process.execPath, ['-e', script], {
  env: Object.assign({}, process.env, { TZ: 'UTC' }),
  encoding: 'utf8'
}).trim()
check('系统时区为 UTC 时仍是北京时间', utcResult, '2026-11-19 08:21:00')

console.log('\n--- 页面确实走这条路 ---')
const render = fs.readFileSync(path.join(WEB, 'render.js'), 'utf8')
const events = fs.readFileSync(path.join(WEB, 'events.js'), 'utf8')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
check('上传时间已转换', /beijingTime\(item\.uploaded_at\)/.test(render), true)
check('待取时间已转换', /beijingTime\(item\.modified_at\)/.test(render), true)
check('事件时间已转换', /beijingTime\(item\.at\)/.test(events), true)
check('刷新标注用北京时间', /beijingClock\(\)/.test(render), true)
check('不再直接用系统时区格式化', /toLocaleTimeString/.test(render), false)
const timeAt = html.indexOf('/time.js')
const renderAt = html.indexOf('/render.js')
check('time.js 先于 render.js 加载', timeAt > 0 && timeAt < renderAt, true)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
