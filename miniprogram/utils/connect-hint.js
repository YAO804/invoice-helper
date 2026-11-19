/**
 * 连接/扫码失败的提示文案。
 *
 * 界面只有两个出口：状态卡一行结论、失败时的模态框（原因 + 下一步）。
 * toast 一行装不下长文案，所以统一在这里产出 { title, content }：
 * title 说「怎么了」，content 说「接下来点哪儿」。
 *
 * 判断顺序从具体到笼统，且内部串（HTTP 401、request:fail）不许直接漏给用户。
 */

const RULES = [
  {
    match: /尚未设置|没有设置 PIN|请先设置 PIN/,
    title: '还没有设置 PIN',
    content: '扫码登录要用 PIN 授权电脑网页。先在下面点「设置 PIN」，填上电脑端设置的那个 PIN，再重新扫码。'
  },
  {
    match: /401|PIN 不正确|PIN 不对/,
    title: 'PIN 不对',
    content: '小程序里存的 PIN 和电脑端不一致。点「设置 PIN」改成电脑网页上设置的那个，再重新扫码。'
  },
  {
    match: /不是攒票小匣|不认识的二维码/,
    title: '扫错二维码了',
    content: '请扫电脑网页上的二维码：网页还没登录时扫登录码；已登录后点「连接小程序」，扫那里显示的码。'
  },
  {
    match: /找到电脑但连不上/,
    title: '找到电脑了但连不上',
    content: '电脑在网络里，但服务没响应。确认电脑端程序还在运行、手机和电脑连的是同一个 WiFi，或者改用扫码连接。'
  },
  {
    match: /没响应|连不上|超时|timeout|request:fail/,
    title: '连不上电脑',
    content: '网络请求没通。确认电脑端程序还开着、手机和电脑在同一个 WiFi，再试一次。'
  },
  {
    match: /没有找到电脑/,
    title: '没找到电脑',
    content: '同一 WiFi 下没搜到。确认电脑端已开启、没被防火墙挡住，或改用「扫码连接电脑」。'
  },
  {
    match: /不支持自动发现|不支持搜索/,
    title: '这台手机不能自动搜索',
    content: '自动搜索只在安卓微信里可用。iPhone 请直接点「扫码连接电脑」。'
  },
  {
    match: /搜索电脑时出错/,
    title: '搜索出错了',
    content: '搜索被系统打断了，请改用「扫码连接电脑」，或手动填写电脑地址。'
  },
  {
    match: /扫码失败|scanCode:fail/,
    title: '扫码没成功',
    content: '相机没读到二维码。换光线好一点的地方、把码放正再扫一次，或手动填写电脑地址。'
  }
]

const FALLBACK = {
  title: '连接失败',
  content: '请再试一次，或改用「扫码连接电脑」，也可以手动填写电脑地址。'
}

function failureTip(message) {
  const text = String(message || '').trim()
  for (let i = 0; i < RULES.length; i++) {
    if (!RULES[i].match.test(text)) continue
    return { title: RULES[i].title, content: RULES[i].content }
  }
  return FALLBACK
}

/**
 * 连接状态徽标。
 *
 * 「已连接」必须由真实请求背书：只有台账同步成功才叫已连接。以前只看
 * 「存没存过电脑地址」，电脑一关机、一换 WiFi，右上角照样绿着说已连接，
 * 而台账其实一张都同步不到。
 */
function statusView(status, opts) {
  const o = opts || {}
  if (status === 'ok') {
    return {
      badge: '已连接',
      tone: '',
      hint: '电脑台账现有 ' + (o.count || 0) + ' 张' + (o.syncing ? '（同步中…）' : '') +
        '。扫到的票会先查重再发送。'
    }
  }
  if (status === 'checking') {
    return { badge: '连接中', tone: 'badge-grey', hint: '正在连电脑，稍等一下…' }
  }
  if (status === 'fail') {
    return {
      badge: '连不上',
      tone: 'badge-warn',
      hint: '连不上电脑' + (o.base ? '（' + o.base + '）' : '') +
        '。确认电脑端程序还开着、手机和电脑连的是同一个 WiFi，再试一次。'
    }
  }
  return {
    badge: '未连接',
    tone: 'badge-grey',
    hint: '还没连电脑。小程序不存台账，必须先连上电脑才能收票。'
  }
}

/**
 * 「当前状态 + 这次要改的字段」→ 一次 setData 补丁。
 * 文案从合成后的状态算，免得先 setData 再算，出现一轮陈旧数字。
 */
function viewState(current, patch) {
  const state = Object.assign({}, current || {}, patch || {})
  const view = statusView(state.status, {
    count: state.ledgerCount,
    syncing: state.syncing,
    base: state.baseText
  })
  return Object.assign({}, patch || {}, {
    statusBadge: view.badge,
    statusTone: view.tone,
    statusHint: view.hint,
    needConnect: state.status !== 'ok' && state.status !== 'checking',
    // 只有真连上才允许走需要电脑的操作；checking 期间也算不能用，
    // 免得用户在「正在连」的半秒里点进扫码，然后发送失败
    ready: state.status === 'ok'
  })
}

/**
 * 「多久以前」的短说法。超过一天就不再折算了，直接给天数——
 * 具体到小时对「数据是不是旧的」这个问题没有帮助。
 */
function agoText(now, at) {
  const stamp = Number(at) || 0
  if (!stamp) return '还没同步过'
  const sec = Math.max(0, Math.round((Number(now || Date.now()) - stamp) / 1000))
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + ' 分钟前'
  const hour = Math.floor(min / 60)
  if (hour < 24) return hour + ' 小时前'
  return Math.floor(hour / 24) + ' 天前'
}

/** 地址去掉协议头，条上只够放主机和端口 */
function hostText(base) {
  return String(base || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * 顶部状态条的视图模型。
 *
 * 条上的空间只够「结论 + 一点细节 + 一个动作」，所以和卡片里的长句子分开：
 * 卡片解释「为什么不能收票」，条只说「现在什么状态、多久没同步、点哪儿」。
 * 四种状态都常驻显示，已连接时降到白底灰字，因为「同步于几分钟前」本身
 * 就是有用的信息，不能一连接上就藏起来。
 */
function barView(status, opts) {
  const o = opts || {}
  if (status === 'ok') {
    const parts = []
    if (o.count) parts.push(o.count + ' 张')
    parts.push(agoText(o.now || Date.now(), o.syncedAt))
    return { tone: 'ok', badge: '已连接', detail: parts.join(' · '), action: '' }
  }
  if (status === 'checking') {
    return { tone: 'idle', badge: '正在连电脑', detail: '稍等一下', action: '' }
  }
  if (status === 'fail') {
    return {
      tone: 'bad',
      badge: '连不上电脑',
      detail: hostText(o.base) || '确认电脑端程序还开着',
      action: '去设置'
    }
  }
  return { tone: 'warn', badge: '未连接电脑', detail: '扫码收票前要先连上', action: '去连接' }
}

module.exports = {
  failureTip: failureTip,
  statusView: statusView,
  viewState: viewState,
  barView: barView,
  agoText: agoText,
  hostText: hostText
}
