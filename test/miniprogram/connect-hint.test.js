/**
 * 连接失败提示文案回归测试。
 *
 *   node test/miniprogram/connect-hint.test.js
 *
 * 重点不是文案漂亮，而是：原因能被正确归类、内部错误串不漏给用户、
 * 判断顺序不会让「尚未设置 PIN」被误判成「PIN 不对」。
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const hint = require('../../miniprogram/utils/connect-hint')

console.log('--- 扫码失败 ---')
check('不是本应用的码', hint.failureTip('这不是攒票小匣的二维码').title, '扫错二维码了')
check('扫错码时告诉用户扫哪儿',
  hint.failureTip('这不是攒票小匣的二维码').content.indexOf('连接小程序') >= 0, true)
check('相机没读到码', hint.failureTip('扫码失败：scanCode:fail 系统错误').title, '扫码没成功')

console.log('\n--- PIN 相关 ---')
check('没设 PIN 优先于 PIN 不对', hint.failureTip('尚未设置 PIN，已取消扫码登录').title, '还没有设置 PIN')
check('401 归为 PIN 不对', hint.failureTip('HTTP 401').title, 'PIN 不对')
check('PIN 不对给去哪儿改',
  hint.failureTip('HTTP 401').content.indexOf('设置 PIN') >= 0, true)
check('不把 401 漏给用户', hint.failureTip('HTTP 401').content.indexOf('401') < 0, true)

console.log('\n--- 连不上 ---')
check('找到但连不上优先于通用连不上',
  hint.failureTip('找到电脑但连不上，请确认电脑端服务在运行、且手机与电脑在同一 WiFi').title,
  '找到电脑了但连不上')
check('探活失败', hint.failureTip('扫到地址了但电脑没响应，确认在同一个 WiFi').title, '连不上电脑')
check('网络超时', hint.failureTip('request:fail timeout').title, '连不上电脑')
check('不把 request:fail 漏给用户',
  hint.failureTip('request:fail timeout').content.indexOf('request:fail') < 0, true)

console.log('\n--- 自动搜索 ---')
check('没搜到', hint.failureTip('没有找到电脑，请确认电脑端已开启、且手机与电脑在同一 WiFi，或改用扫码连接').title, '没找到电脑')
check('iOS 不支持', hint.failureTip('这台设备不支持自动发现，请扫码连接或手动填写电脑地址').title, '这台手机不能自动搜索')
check('搜索被打断', hint.failureTip('搜索电脑时出错，请改用扫码连接或手动填写地址').title, '搜索出错了')

console.log('\n--- 兜底 ---')
check('空消息也有话说', hint.failureTip('').title, '连接失败')
check('空消息给下一步', hint.failureTip('').content.indexOf('扫码连接电脑') >= 0, true)
check('未知错误不回显原始串', hint.failureTip('some internal panic at 0x0').content.indexOf('0x0') < 0, true)
check('非字符串不炸', hint.failureTip(undefined).title, '连接失败')

console.log('\n--- 连接状态徽标 ---')
// 「已连接」必须有真实请求背书。之前只看存没存过电脑地址，电脑关机了照样显示已连接
check('没配地址说未连接', hint.statusView('none').badge, '未连接')
check('未连接是灰的', hint.statusView('none').tone, 'badge-grey')
check('未连接说清为什么不能收票', hint.statusView('none').hint.indexOf('必须先连上电脑') >= 0, true)
check('同步中显示连接中', hint.statusView('checking').badge, '连接中')
check('同步成功才是已连接', hint.statusView('ok', { count: 12 }).badge, '已连接')
check('已连接复述台账张数', hint.statusView('ok', { count: 12 }).hint.indexOf('现有 12 张') >= 0, true)
check('同步中带括号提示', hint.statusView('ok', { count: 3, syncing: true }).hint.indexOf('（同步中…）') >= 0, true)
check('张数为 0 也要写出来', hint.statusView('ok', { count: 0 }).hint.indexOf('现有 0 张') >= 0, true)
check('同步失败显示连不上', hint.statusView('fail', { base: 'http://192.168.1.20:8765' }).badge, '连不上')
check('连不上用警示色', hint.statusView('fail').tone, 'badge-warn')
check('连不上把地址写出来，方便核对', hint.statusView('fail', { base: 'http://192.168.1.20:8765' }).hint.indexOf('192.168.1.20') >= 0, true)
check('未知状态按未连接处理', hint.statusView('whatever').badge, '未连接')

console.log('\n--- 状态合成 ---')
// 页面只 setData 一次，徽标/提示都从合成后的状态算，避免出现一轮陈旧张数
const stateNone = hint.viewState({ status: 'none' }, { status: 'checking', baseText: 'http://x:8765' })
check('切到连接中：徽标跟着变', stateNone.statusBadge, '连接中')
check('切到连接中：先不弹去连接按钮（检查期间弹出来只会闪一下）', stateNone.needConnect, false)
const stateOk = hint.viewState(
  { status: 'checking', ledgerCount: 0, baseText: 'http://x:8765' },
  { status: 'ok', ledgerCount: 12, syncing: false })
check('同步成功：这次就要用新的张数', stateOk.statusBadge, '已连接')
check('同步成功：张数是这次的', stateOk.statusHint.indexOf('现有 12 张') >= 0, true)
check('同步成功：收起去连接按钮', stateOk.needConnect, false)
const stateFail = hint.viewState(
  { status: 'ok', ledgerCount: 12, baseText: 'http://x:8765' },
  { status: 'fail', ledgerCount: 0 })
check('同步失败：立刻不再说已连接', stateFail.statusBadge, '连不上')
check('同步失败：把去连接按钮放回来', stateFail.needConnect, true)
check('同步失败：地址取自上一个状态', stateFail.statusHint.indexOf('http://x:8765') >= 0, true)
check('只有已连接才算可用', hint.viewState({ status: 'ok' }, {}).ready, true)
check('连接中不算可用（免得半秒里点进扫码）', hint.viewState({ status: 'checking' }, {}).ready, false)
check('未连接不算可用', hint.viewState({ status: 'none' }, {}).ready, false)

console.log('\n--- 顶部状态条 ---')
const NOW = 1763510400000
check('未连接用琥珀色（不是报错色）', hint.barView('none').tone, 'warn')
check('未连接给出动作', hint.barView('none').action, '去连接')
check('连不上才用警示色', hint.barView('fail').tone, 'bad')
check('连不上给出设置入口', hint.barView('fail').action, '去设置')
check('连不上直接显示主机端口',
  hint.barView('fail', { base: 'http://192.168.1.20:8765' }).detail, '192.168.1.20:8765')
check('没有地址时给检查建议',
  hint.barView('fail', { base: '' }).detail, '确认电脑端程序还开着')
check('连接中不给动作（避免重复点）', hint.barView('checking').action, '')
check('已连接不放动作，只报状态', hint.barView('ok', { count: 12, syncedAt: NOW }).action, '')
check('已连接带张数与时间',
  hint.barView('ok', { count: 12, syncedAt: NOW - 3 * 60 * 1000, now: NOW }).detail, '12 张 · 3 分钟前')
check('没有张数时只说时间',
  hint.barView('ok', { syncedAt: NOW - 65 * 1000, now: NOW }).detail, '1 分钟前')
check('一分钟内说刚刚', hint.agoText(NOW, NOW - 30 * 1000), '刚刚')
check('分钟级', hint.agoText(NOW, NOW - 20 * 60 * 1000), '20 分钟前')
check('小时级', hint.agoText(NOW, NOW - 5 * 3600 * 1000), '5 小时前')
check('超过一天给天数', hint.agoText(NOW, NOW - 26 * 3600 * 1000), '1 天前')
check('从没同步过', hint.agoText(NOW, 0), '还没同步过')
check('时间不会算成负数', hint.agoText(NOW, NOW + 60000), '刚刚')
check('地址去掉协议和尾斜杠', hint.hostText('https://pc.local:9000/'), 'pc.local:9000')
check('地址为空时不写', hint.hostText(''), '')

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
