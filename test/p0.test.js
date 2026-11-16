/**
 * P0 回归测试：分类、来源文案、统计聚合、待复核清单。
 *
 *   node test/p0.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

/* ---------- 模拟微信环境（必须在 require 之前） ---------- */

const files = {}
const dirs = {}
const storage = {}

const fs = {
  accessSync(p) { if (!files[p] && !dirs[p]) throw new Error('ENOENT ' + p) },
  mkdirSync(p) { dirs[p] = true },
  writeFileSync(p, s) { files[p] = String(s) },
  readFileSync(p) { if (files[p] === undefined) throw new Error('ENOENT ' + p); return files[p] },
  readdirSync(p) {
    const pre = p + '/'
    return Object.keys(files).concat(Object.keys(dirs))
      .filter(function (k) { return k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0 })
      .map(function (k) { return k.slice(pre.length) })
  }
}

global.wx = {
  env: { USER_DATA_PATH: '/usr' },
  getFileSystemManager() { return fs },
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v }
}

const category = require('../miniprogram/utils/category')
const labels = require('../miniprogram/utils/labels')
const stats = require('../miniprogram/utils/stats')
const review = require('../miniprogram/utils/review')
const store = require('../miniprogram/utils/store')

store.setEnv({ root: '/usr/invoices', fileSystem: fs })
store.init()

console.log('--- 分类规则 ---')
check('分类表', category.CATEGORIES, ['未分类', '餐饮', '交通', '住宿', '办公', '其他'])
check('明细命中餐饮', category.guess('餐费', [], ''), '餐饮')
check('明细命中交通', category.guess('滴滴出行', [], ''), '交通')
check('明细命中住宿', category.guess('住宿费', [], ''), '住宿')
check('明细命中办公', category.guess('打印纸', [], ''), '办公')
check('销方兜底', category.guess('', [], '某某咖啡店'), '餐饮')
check('未命中留未分类', category.guess('未知商品', [], ''), '未分类')

console.log('--- 展示文案 ---')
check('来源短名', labels.sourceName('xml'), 'XML')
check('来源长名', labels.sourceName('qr', true), '扫码草稿')
check('未知来源', labels.sourceName('?'), '其他')
check('时间兜底', labels.importText(null), '导入时间未知')
const ts = new Date(2026, 0, 2, 3, 4).getTime()
check('导入时间', labels.importText(ts), '导入 1-02 03:04')

console.log('--- 自动分类与默认值 ---')
const parsed = {
  ok: true,
  invoiceNo: '22222222',
  issueTime: '2026-11-03 10:00:00',
  seller: { name: '宁波顺渝餐饮管理有限公司', idNum: '' },
  buyer: {},
  items: [{ name: '餐费', amount: '100.00', tax: '0.00', withTax: '100.00' }],
  amount: { withoutTax: '100.00', tax: '0.00', withTax: '100.00' }
}
check('解析结果自动分类', store.fromParsed(parsed).category, '餐饮')
check('缺省分类', store.upsertInvoice({ invoice_no: '33333333', issue_date: '2026-11-01', total_cent: 0 }).category, '未分类')

console.log('--- 台账筛选与待复核 ---')
const a = store.upsertInvoice({
  invoice_no: '11111111', issue_date: '2026-11-01', total_cent: 10000,
  amount_excl_tax_cent: 10000, tax_cent: 0, category: '餐饮', source: 'xml'
})
store.upsertInvoice({
  invoice_no: '', issue_date: '2026-11-02', total_cent: 5000,
  source: 'ofd', anomaly: ['字段待补录']
})
store.upsertInvoice({
  invoice_no: '26932000001295659876', issue_date: '2026-11-03', total_cent: 20000,
  source: 'xml', category: '办公', anomaly: ['金额勾稽不符']
})
check('按分类筛选', store.listInvoices({ category: '餐饮' }).map(function (x) { return x.id }), [a.id])
check('无匹配分类', store.listInvoices({ category: '住宿' }).length, 0)
check('待复核数量', store.reviewList().length, 2)

console.log('--- 统计聚合 ---')
const list = store.listInvoices({ sortBy: 'issued' })
const sum = stats.summary(list)
check('汇总', [sum.count, sum.totalCent, sum.taxCent], [4, 35000, 0])

const cats = stats.byCategory(list)
check('分类名称按金额降序', cats.map(function (x) { return x.name }), ['办公', '餐饮', '未分类'])
check('分类占比', cats.map(function (x) { return x.percent }), [57, 29, 14])
check('分类金额', cats[0].amountText, '200.00')

const sources = stats.bySource(list)
check('来源名称', sources.map(function (x) { return x.name }), ['XML', 'OFD', '手录'])
check('来源占比', sources[0].percent, 86)

console.log('--- 待复核原因 ---')
check('缺号码', review.reasons({ invoice_no: '', anomaly: [] }), ['缺发票号码'])
check('异常标记', review.reasons({ invoice_no: '11111111', anomaly: ['金额勾稽不符'] }), ['金额勾稽不符'])
check('兜底提示', review.reasons({ invoice_no: '11111111', anomaly: [] }), ['字段待人工确认'])
check('卡片数量', review.cards().length, 2)
check('卡片原因', review.cards()[0].reasons.length > 0, true)

console.log('\n' + (failCount ? 'FAIL ' + failCount + ' 项' : '全部通过'))
process.exit(failCount ? 1 : 0)
