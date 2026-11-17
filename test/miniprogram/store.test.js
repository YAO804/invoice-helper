/**
 * store.js 回归测试：内存文件系统，不依赖 wx。
 *
 *   node test/miniprogram/store.test.js
 */

const store = require('../../miniprogram/utils/store')
const batch = require('../../miniprogram/utils/batch')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

/* ---------- 内存 FS ---------- */
function memFs() {
  const files = {}
  const dirs = {}
  return {
    accessSync(p) { if (!files[p] && !dirs[p]) throw new Error('ENOENT ' + p) },
    mkdirSync(p) { dirs[p] = true },
    writeFileSync(p, s) { files[p] = String(s) },
    readFileSync(p) { if (files[p] === undefined) throw new Error('ENOENT ' + p); return files[p] },
    readdirSync(p) {
      const prefix = p + '/'
      const out = []
      Object.keys(files).forEach(function (k) {
        if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) out.push(k.slice(prefix.length))
      })
      Object.keys(dirs).forEach(function (k) {
        if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) out.push(k.slice(prefix.length))
      })
      return out
    },
    unlinkSync(p) { delete files[p] },
    _files: files,
    _dropIndex() { Object.keys(files).forEach(function (k) { if (/index\.json$/.test(k)) delete files[k] }) }
  }
}

const fs = memFs()
store.setEnv({ root: '/usr/invoices', fileSystem: fs })
store.init()

console.log('--- 金额换算 ---')
check('147.00 → 14700 分', store.toCents('147.00'), 14700)
check('带千分位', store.toCents('1,234.56'), 123456)
check('数字入参', store.toCents(8.32), 832)
check('空值归零', store.toCents(''), 0)
check('非法值归零', store.toCents('abc'), 0)
check('显示层', store.yuan(14700), '147.00')

console.log('\n--- 新增与分片 ---')
const a = store.upsertInvoice({
  invoice_no: '26932000001295659876', issue_date: '2026-08-02',
  seller_name: '宁波顺渝餐饮管理有限公司', total_cent: 14700,
  amount_excl_tax_cent: 13868, tax_cent: 832, source: 'xml'
})
check('分配 id', a.id, 1)
check('按月分片落盘', !!fs._files['/usr/invoices/ledger/2026-08.json'], true)

const b = store.upsertInvoice({
  invoice_no: '26932000001877489821', issue_date: '2026-11-10',
  seller_name: '南京某某科技有限公司', total_cent: 1050000,
  amount_excl_tax_cent: 990566, tax_cent: 59434, source: 'qr'
})
check('第二个月另起分片', !!fs._files['/usr/invoices/ledger/2026-11.json'], true)
check('索引 nextId', JSON.parse(fs._files['/usr/invoices/index.json']).nextId, 3)

console.log('\n--- 查询与筛选 ---')
check('全部按日期倒序', store.listInvoices().map(function (i) { return i.invoice_no }),
  ['26932000001877489821', '26932000001295659876'])
check('按月份', store.listInvoices({ month: '2026-08' }).length, 1)
check('按销方关键字', store.listInvoices({ seller: '顺渝' }).length, 1)
check('按全文关键字', store.listInvoices({ keyword: '10500' }).length, 1)
check('按来源', store.listInvoices({ status: 'unknown' }).length, 2)
check('金额下限', store.listInvoices({ minCent: 200000 }).length, 1)
check('取详情', store.getInvoice(1).seller_name, '宁波顺渝餐饮管理有限公司')
check('月份列表', store.months(), ['2026-11', '2026-08'])

console.log('\n--- 去重 ---')
check('同号码+日期+金额命中', store.findDuplicate({
  invoice_no: '26932000001295659876', issue_date: '2026-08-02', total_cent: 14700
}).id, 1)
check('金额不同不算重复', store.findDuplicate({
  invoice_no: '26932000001295659876', issue_date: '2026-08-02', total_cent: 14800
}), null)

console.log('\n--- 编辑与删除 ---')
const edited = store.upsertInvoice({ id: 1, invoice_no: a.invoice_no, issue_date: a.issue_date,
  seller_name: '改过的销方', total_cent: 14700, note: '已补录' })
check('同 id 更新不新增', store.listInvoices({ month: '2026-08' }).length, 1)
check('更新内容生效', edited.note, '已补录')
check('旧去重键已清', store.findDuplicate({ invoice_no: a.invoice_no, issue_date: a.issue_date, total_cent: 14700 }).id, 1)
check('跨月编辑后旧分片清空', (function () {
  const moved = store.upsertInvoice({ id: 1, invoice_no: a.invoice_no, issue_date: '2026-09-15',
    seller_name: '改过的销方', total_cent: 14700 })
  return moved.id === 1 && store.listInvoices({ month: '2026-08' }).length === 0 &&
    store.listInvoices({ month: '2026-09' }).length === 1
})(), true)
check('改回原月份可再次移动', store.upsertInvoice({ id: 1, invoice_no: a.invoice_no,
  issue_date: '2026-08-02', total_cent: 14700 }).id, 1)
check('删除成功', store.deleteInvoice(1), true)
check('删除后查不到', store.getInvoice(1), null)
check('重复删除返回 false', store.deleteInvoice(1), false)

console.log('\n--- 索引损坏后的恢复 ---')
fs._dropIndex()
const rebuilt = store.rebuildIndex()
check('重建后 nextId', rebuilt.nextId, 3)
check('重建后按 id 找得到', store.getInvoice(2).invoice_no, '26932000001877489821')
check('重建后去重键恢复', store.findDuplicate({
  invoice_no: '26932000001877489821', issue_date: '2026-11-10', total_cent: 1050000
}).id, 2)

console.log('\n--- 月度汇总 ---')
const stat = store.monthStats('2026-11')
check('张数', stat.count, 1)
check('价税合计（分）', stat.totalCent, 1050000)

console.log('\n--- 解析结果转台账 ---')
const parsed = {
  ok: true, invoiceNo: '26932000001295659876', eiid: '26932000001295659876',
  version: '0.37', tag: 'SWEI3302', issueTime: '2026-08-02',
  typeLabel: '普通发票', isBlue: true, drawer: '林素贞',
  seller: { name: '宁波顺渝餐饮管理有限公司', idNum: '91330205MACB4PTU91' },
  buyer: { name: '姚未正（个人）', idNum: null },
  amount: { withTax: '147.00', withoutTax: '138.68', tax: '8.32', withTaxCN: '壹佰肆拾柒圆整' },
  labels: { vatType: { code: '02', name: '普通发票' } },
  signature: { present: true, algorithmName: 'SM2' },
  items: [{ name: '*生产生活服务*餐饮', taxRate: '0.06', amount: '138.68', tax: '8.32', withTax: '147.00' }]
}
const converted = store.fromParsed(parsed)
check('转档成功', !!converted, true)
check('金额转分', converted.total_cent, 14700)
check('开票日期截取', converted.issue_date, '2026-08-02')
check('个人抬头税号为空', converted.buyer_tax_id, '')
check('明细行号', converted.items[0].line_no, 1)
check('税率保留', converted.tax_rate, '0.06')
check('真实样本勾稽无异常', converted.anomaly, [])
check('元数据带签名算法名', converted.meta.signature.algorithmName, 'SM2')

console.log('\n--- 勾稽校验 ---')
check('金额不符能检出', store.validate({
  invoice_no: '26932000001295659876', amount_excl_tax_cent: 10000, tax_cent: 100, total_cent: 14700, items: []
}).length, 1)
check('明细合计不符能检出', store.validate({
  invoice_no: '26932000001295659876', amount_excl_tax_cent: 13868, tax_cent: 832, total_cent: 14700,
  items: [{ amount_cent: 10000 }]
}).length, 1)
check('号码位数异常能检出', store.validate({
  invoice_no: '123', amount_excl_tax_cent: 0, tax_cent: 0, total_cent: 0, items: []
}).length, 1)

console.log('\n--- 扫码草稿 ---')
const qrDraft = store.fromQr({
  invoiceNo: '26932000001877489821', invoiceCode: '', amount: '10500.00',
  issueDate: '20261110', invoiceType: '数电票'
}, { raw: '01,31,,26932000001877489821,10500.00,20261110,,277D' })
check('草稿生成', !!qrDraft, true)
check('日期转成 YYYY-MM-DD', qrDraft.issue_date, '2026-11-10')
check('草稿金额为分', qrDraft.total_cent, 1050000)
check('草稿置信度低', qrDraft.confidence, 0.8)
check('原始二维码保留', qrDraft.raw_qr.indexOf('01,31,') === 0, true)
check('扫码草稿不误报金额勾稽', qrDraft.anomaly[0].indexOf('字段待补录') > 0, true)

console.log('\n--- 排序口径：导入时间 / 开票日期 ---')
const oldImport = store.upsertInvoice({ invoice_no: 'OLDIMPORT', issue_date: '2026-12-31',
  created_at: Date.now() + 1000, total_cent: 100, seller_name: '晚开票早导入' })
const newImport = store.upsertInvoice({ invoice_no: 'NEWIMPORT', issue_date: '2026-01-01',
  created_at: Date.now() + 2000, total_cent: 200, seller_name: '早开票晚导入' })
check('按开票日期倒序', store.listInvoices({ sortBy: 'issued' })[0].invoice_no, 'OLDIMPORT')
check('按导入时间倒序', store.listInvoices({ sortBy: 'created' })[0].invoice_no, 'NEWIMPORT')
const createdOrder = store.listInvoices({ sortBy: 'created' })
const pos = function (no) {
  for (let i = 0; i < createdOrder.length; i++) if (createdOrder[i].invoice_no === no) return i
  return 9999
}
check('导入时间优先于号码顺序', pos('NEWIMPORT') < pos('OLDIMPORT'), true)
const nowDate = new Date()
const thisMonth = nowDate.getFullYear() + '-' + String(nowDate.getMonth() + 1).padStart(2, '0')
check('按导入月份能列出', store.months('created').indexOf(thisMonth) >= 0, true)
check('按开票月份仍能列出', store.months('issued').indexOf('2026-12') >= 0, true)
const byCreated = store.listInvoices({ month: thisMonth, monthBasis: 'created' })
check('导入月份筛选不漏票', byCreated.some(function (inv) { return inv.invoice_no === 'NEWIMPORT' }), true)
check('开票月不同仍按导入月筛到', byCreated.some(function (inv) { return inv.invoice_no === 'OLDIMPORT' }), true)
check('偏好默认 created', store.getBasis(), 'created')
check('无 wx 时设置偏好安全降级', store.setBasis('issued'), 'created')

console.log('\n--- 批量落库 ---')
const report = batch.saveAll([
  { invoice_no: 'BATCH001', issue_date: '2026-05-01', total_cent: 300 },
  { invoice_no: 'BATCH001', issue_date: '2026-05-01', total_cent: 300 },
  { invoice_no: '', issue_date: '2026-05-02', total_cent: 400, source: 'ofd' },
  { invoice_no: '', issue_date: '2026-05-02', total_cent: 400, source: 'ofd' },
  null
])
check('新增 3 条', report.saved, 3)
check('重复跳过 1 条', report.duplicate, 1)
check('两张空号码草稿都入库', report.incomplete, 2)
check('空草稿计失败 1 条', report.failed, 1)
check('汇总文案', batch.describe(report), '新入库 3 张，待补录 2 张，重复跳过 1 张，失败 1 张')

console.log('\n--- 重复票按来源质量升级 ---')
const qrOld = { id: 99, invoice_no: 'MIX001', issue_date: '2026-06-01', total_cent: 100,
  source: 'qr', confidence: 0.8, files: [{ path: '/a' }], created_at: 111 }
const xmlNew = { invoice_no: 'MIX001', issue_date: '2026-06-01', total_cent: 100,
  source: 'xml', confidence: 1, seller_name: '完整销方', files: [{ path: '/b' }], anomaly: [] }
const merged = batch.mergeBetter(qrOld, xmlNew)
check('升级后来源为 xml', merged.source, 'xml')
check('保留原记录 id', merged.id, 99)
check('保留首次导入时间', merged.created_at, 111)
check('两份原件都保留', merged.files.length, 2)
check('低质量不能反向覆盖', batch.mergeBetter(xmlNew, qrOld), null)

store.upsertInvoice({ invoice_no: 'UPGRADE001', issue_date: '2026-07-01',
  total_cent: 500, source: 'qr', created_at: Date.now() })
const upgradeReport = batch.saveAll([{ invoice_no: 'UPGRADE001', issue_date: '2026-07-01',
  total_cent: 500, source: 'xml', seller_name: '补全的销方', confidence: 1 }])
check('重复但自动升级', upgradeReport.upgraded, 1)
check('不算新入库', upgradeReport.saved, 0)
check('销方已补全', store.listInvoices({ keyword: 'UPGRADE001' })[0].seller_name, '补全的销方')

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
