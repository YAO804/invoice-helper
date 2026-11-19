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

module.exports = {
  failureTip: failureTip
}
