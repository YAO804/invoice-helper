/**
 * 收票草稿：把二维码 / XML / 版式文件转成「准备发到电脑台账」的一条记录。
 *
 * 小程序不再保存台账，所以这里全是纯函数，不碰任何存储：
 * 草稿只在内存里活到发送成功为止，退出小程序即丢。
 *
 * 金额单位统一用「分」（整数），发送前才转成电脑端的字符串元，
 * 避免 0.1 + 0.2 这类浮点误差进台账。
 */

const UNKNOWN_KIND = '未知票种'

/** 金额字符串 → 整数分；空值/非数字都返回 0，不抛异常 */
function toCents(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

/** 分 → "11.30" */
function yuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

/** 分 → 电脑端金额字段：0 表示没填，留空而不是写 "0.00" */
function totalText(cents) {
  const value = Number(cents) || 0
  return value > 0 ? yuan(value) : ''
}

/**
 * 判重键：发票代码 + 发票号码，与电脑端 identityKey 同一口径。
 *
 * 数电票没有代码（20 位号码全国唯一），键退化为号码本身。
 * 金额与开票日期不参与——它们会因补录和格式抖动变化，漏判就是重复报销。
 */
function dedupeKey(draft) {
  return (draft.code || '') + '|' + (draft.number || '')
}

/** 只校验号码位数，不做真伪判断 */
function validate(draft) {
  const number = String(draft.number || '')
  if (number && number.length !== 8 && number.length !== 20) {
    return ['发票号码位数异常：' + number.length + ' 位']
  }
  return []
}

function draft(fields) {
  const out = {
    number: fields.number || '',
    code: fields.code || '',
    kind: fields.kind || UNKNOWN_KIND,
    issue_date: fields.issue_date || '',
    total_cent: Number(fields.total_cent) || 0,
    reimburser: fields.reimburser || '',
    source: fields.source || 'manual',
    note: fields.note || ''
  }
  out.anomaly = validate(out)
  return out
}

/** parseLegacyQr() 的结果 → 草稿。字段不全，只能拿到号码/代码/日期/金额。 */
function fromQr(qr, extra) {
  if (!qr || !qr.invoiceNo) return null
  const digits = String(qr.issueDate || '')
  return draft({
    number: qr.invoiceNo,
    code: qr.invoiceCode || '',
    kind: qr.invoiceType || UNKNOWN_KIND,
    issue_date: digits.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    total_cent: toCents(qr.amount),
    reimburser: '',
    source: 'qr',
    note: '扫码草稿：报销人待补录'
  })
}

/** extractInvoice() 的结果 → 草稿 */
function fromParsed(parsed, extra) {
  if (!parsed || !parsed.ok) return null
  const options = extra || {}
  return draft({
    number: parsed.invoiceNo || '',
    code: '',
    kind: parsed.typeLabel || '数电票',
    issue_date: String(parsed.issueTime || '').slice(0, 10),
    total_cent: toCents(parsed.amount && parsed.amount.withTax),
    reimburser: '',
    source: options.source || 'xml',
    note: 'XML 自动解析'
  })
}

/** OFD / PDF 只是版式文件，端侧不解析，字段留空等电脑端补录 */
function fromLayout(ext) {
  return draft({
    number: '',
    kind: '数电票',
    source: ext || 'pdf',
    note: ext === 'ofd' ? 'OFD 版式文件，字段待补录' : 'PDF 版式文件，字段待补录'
  })
}

/** 草稿 → 电脑端 /api/invoices 的单条 payload */
function toInvoice(item) {
  return {
    number: item.number || '',
    code: item.code || '',
    kind: item.kind || '',
    issue_date: item.issue_date || '',
    total: totalText(item.total_cent),
    reimburser: item.reimburser || ''
  }
}

module.exports = {
  UNKNOWN_KIND: UNKNOWN_KIND,
  toCents: toCents,
  yuan: yuan,
  totalText: totalText,
  dedupeKey: dedupeKey,
  validate: validate,
  fromQr: fromQr,
  fromParsed: fromParsed,
  fromLayout: fromLayout,
  toInvoice: toInvoice
}
