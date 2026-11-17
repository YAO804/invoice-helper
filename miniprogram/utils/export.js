/**
 * M5 导出：台账 CSV、原件清单、到期提醒。
 * 纯端侧拼装，文件写私有目录，再由用户转发到微信会话落到电脑。
 */

const fsx = require('./fsx')
const store = require('./store')
const csv = require('./csv')

/**
 * 只导出对账用得上的票面字段，列头与电脑端台账保持一致（电脑端按列名导入）。
 * 状态 / 异常提示 / 备注 / 原件明细属于 App 内部管理信息，不进对账表。
 */
const LEDGER_HEADERS = [
  '发票号码', '发票代码', '票种', '开票日期',
  '价税合计', '报销人', '来源'
]

const FILE_HEADERS = ['发票号码', '开票日期', '报销人', '文件名', '大小(字节)', '摘要', '摘要算法', '本地路径']

function ledgerRow(inv) {
  return [
    inv.invoice_no, inv.invoice_code, inv.invoice_type, inv.issue_date,
    store.yuan(inv.total_cent), inv.reimburser || '', inv.source
  ]
}

function fileRows(list) {
  const rows = []
  list.forEach(function (inv) {
    (inv.files || []).forEach(function (f) {
      rows.push([
        inv.invoice_no, inv.issue_date, inv.reimburser || '',
        f.name, f.size, f.digest, f.digestType || '', f.path
      ])
    })
  })
  return rows
}

function ledgerCsv(list) {
  return csv.build(LEDGER_HEADERS, list.map(ledgerRow))
}

function manifestCsv(list) {
  return csv.build(FILE_HEADERS, fileRows(list))
}

function exportDir() {
  return fsx.userDir() + '/export'
}

function stamp() {
  const d = new Date()
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes())
}

/** 写入私有目录，返回可直接喂给 wx.shareFileMessage 的路径 */
function writeCsv(name, content) {
  fsx.ensureDir(exportDir())
  const path = exportDir() + '/' + stamp() + '_' + name.replace(/[\\/:*?"<>|]/g, '_')
  wx.getFileSystemManager().writeFileSync(path, content, 'utf8')
  return path
}

/** 30 天前的原件，返回 [{name, path, ageDays}] */
function expiredFiles(ttlDays) {
  const ttl = (ttlDays || 30) * 86400
  const now = Math.floor(Date.now() / 1000)
  return fsx.walk(fsx.userDir() + '/files').filter(function (f) {
    return f.mtime && (now - f.mtime) > ttl
  }).map(function (f) {
    return { name: f.name, path: f.path, ageDays: Math.floor((now - f.mtime) / 86400) }
  })
}

function allFiles(list) {
  const out = []
  list.forEach(function (inv) {
    (inv.files || []).forEach(function (f) { out.push(f) })
  })
  return out
}

module.exports = {
  ledgerCsv: ledgerCsv,
  manifestCsv: manifestCsv,
  writeCsv: writeCsv,
  expiredFiles: expiredFiles,
  allFiles: allFiles
}
