/**
 * 统计小程序介绍/名称的字符数
 * 规则：非 ASCII 字符（汉字、中文标点）算 2 个字符，ASCII 算 1 个。
 * 这是偏保守的算法——若微信实际按 word 计，我们的结果只会更安全。
 *
 *   node scripts/count-intro.js
 */

const LIMIT = 120
const FLOOR = 4

function countChars(s) {
  let n = 0
  for (const ch of s) {
    n += ch.codePointAt(0) > 0x7f ? 2 : 1
  }
  return n
}

const candidates = [
  '个人自用的票据归集工具。扫码或导入 XML 自动提取金额、日期、销方信息，按月归档到手机本地，方便对账。数据不上传服务器。',
  '自用票据归集工具。扫码或导入 XML 自动提取金额、日期、销方信息，按月存到手机本地。数据不上传，不做查验。',
  '个人自用的票据整理工具。扫码或导入 XML 提取票面信息，按月归档到本机，方便对账。所有数据只存在这台手机，不上传服务器。',
  '攒票小匣：个人自用的票据归集工具。扫码或导入 XML 提取信息，按月归档到本机。数据只存本地，不上传服务器。'
]

candidates.forEach(function (s, i) {
  const n = countChars(s)
  const ok = n >= FLOOR && n <= LIMIT
  console.log('\n[' + (i + 1) + '] ' + n + ' 字符  ' + (ok ? '✓ 合规' : '✗ 超限'))
  console.log(s)
})
