/**
 * draft.js 回归测试：金额换算、判重键、字段校验、二维码/XML 映射。
 *
 *   node test/miniprogram/draft.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const draft = require('../../miniprogram/utils/draft')

console.log('--- 金额换算 ---')
check('字符串金额转分', draft.toCents('147.00'), 14700)
check('带千分位', draft.toCents('1,234.50'), 123450)
check('数字金额', draft.toCents(105), 10500)
check('空值算 0', draft.toCents(''), 0)
check('null 算 0', draft.toCents(null), 0)
check('非数字算 0', draft.toCents('abc'), 0)
check('浮点不丢精度', draft.toCents('0.1') + draft.toCents('0.2'), 30)
check('分转元', draft.yuan(14700), '147.00')
check('金额为 0 留空', draft.totalText(0), '')
check('金额非 0 转字符串', draft.totalText(14700), '147.00')

console.log('\n--- 判重键 ---')
check('代码+号码', draft.dedupeKey({ code: 'C1', number: 'N1' }), 'C1|N1')
check('无代码退化为号码', draft.dedupeKey({ number: 'N1' }), '|N1')
check('金额与日期不参与',
  draft.dedupeKey({ code: 'C1', number: 'N1', total_cent: 1, issue_date: '2026-01-01' }),
  draft.dedupeKey({ code: 'C1', number: 'N1', total_cent: 999, issue_date: '2026-05-05' }))

console.log('\n--- 号码位数校验 ---')
check('8 位老票不报异常', draft.validate({ number: '12345678' }), [])
check('20 位数电票不报异常', draft.validate({ number: '26932000001877489821' }), [])
check('位数不对要提示', draft.validate({ number: '1234567890' }).length, 1)
check('空号码不报异常', draft.validate({ number: '' }), [])

console.log('\n--- 扫码草稿 ---')
const qr = draft.fromQr({ invoiceNo: '26932000001877489821', invoiceCode: '', invoiceType: '电子发票', issueDate: '20261110', amount: '10500.00' })
check('号码', qr.number, '26932000001877489821')
check('日期补横线', qr.issue_date, '2026-11-10')
check('金额转分', qr.total_cent, 1050000)
check('来源 qr', qr.source, 'qr')
check('报销人留空', qr.reimburser, '')
check('没有号码返回 null', draft.fromQr({}), null)

console.log('\n--- XML 草稿 ---')
const parsed = {
  ok: true,
  invoiceNo: '26932000001295659876',
  typeLabel: '普通发票',
  issueTime: '2026-08-02 10:00:00',
  amount: { withTax: '147.00' }
}
const xml = draft.fromParsed(parsed)
check('号码', xml.number, '26932000001295659876')
check('日期取前 10 位', xml.issue_date, '2026-08-02')
check('票种', xml.kind, '普通发票')
check('金额', xml.total_cent, 14700)
check('来源 xml', xml.source, 'xml')
check('解析失败返回 null', draft.fromParsed({ ok: false }), null)

console.log('\n--- 版式文件草稿 ---')
const ofd = draft.fromLayout('ofd')
check('没有号码', ofd.number, '')
check('票种默认数电票', ofd.kind, '数电票')
check('备注说明待补', ofd.note.indexOf('待补录') > 0, true)

console.log('\n--- 发送字段 ---')
const invoice = draft.toInvoice(qr)
check('发送号码', invoice.number, '26932000001877489821')
check('发送金额字符串', invoice.total, '10500.00')
check('不发送本地字段', invoice.total_cent, undefined)
check('发送票种', invoice.kind, '电子发票')

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
