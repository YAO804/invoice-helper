/**
 * csv.js / export.js 回归测试：模拟 wx 文件系统，不依赖微信环境。
 *
 *   node test/miniprogram/export.test.js
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
const now = Math.floor(Date.now() / 1000)

global.wx = {
  env: { USER_DATA_PATH: '/usr' },
  getFileSystemManager() {
    return {
      accessSync(p) { if (!files[p] && !dirs[p]) throw new Error('ENOENT ' + p) },
      mkdirSync(p) { dirs[p] = true },
      writeFileSync(p, s) { files[p] = String(s) },
      readFileSync(p) { if (files[p] === undefined) throw new Error('ENOENT ' + p); return files[p] },
      readdirSync(p) {
        const pre = p + '/'
        return Object.keys(files).concat(Object.keys(dirs))
          .filter(function (k) { return k.indexOf(pre) === 0 && k.slice(pre.length).indexOf('/') < 0 })
          .map(function (k) { return k.slice(pre.length) })
      },
      statSync(p) {
        if (files[p] === undefined) throw new Error('ENOENT ' + p)
        const old = /old/.test(p)
        return { size: files[p].length, lastModifiedTime: old ? now - 40 * 86400 : now - 60, isDirectory: function () { return false } }
      }
    }
  }
}

files['/usr/invoices/files/aaaaaaaa_old.xml'] = 'old'
files['/usr/invoices/files/bbbbbbbb_fresh.xml'] = 'new'

const csv = require('../../miniprogram/utils/csv')
const exporter = require('../../miniprogram/utils/export')

console.log('--- CSV 基础 ---')
check('逗号加引号', csv.cell('a,b'), '"a,b"')
check('双引号转义', csv.cell('a"b'), '"a""b"')
check('换行加引号', csv.cell('a\nb'), '"a\nb"')
check('空值', csv.cell(null), '')
check('一行', csv.row(['a', 'b,c']), 'a,"b,c"')

const built = csv.build(['名称', '金额'], [['甲公司', '12.34']])
check('带 BOM', built.charCodeAt(0), 0xfeff)
check('CRLF 分隔', built.indexOf('\r\n') > 0, true)
check('末尾换行', built.slice(-2), '\r\n')

console.log('\n--- 台账 CSV ---')
const list = [
  {
    invoice_no: '26932000001295659876', invoice_code: '', invoice_type: '普通发票',
    issue_date: '2026-08-02', total_cent: 14700, reimburser: '宁波,顺渝',
    source: 'xml',
    anomaly: ['号码位数异常'], note: '测试,备注', created_at: Date.now(),
    files: [{ name: 'a.xml', size: 4304, digest: 'abcdef12', digestType: 'md5', path: '/usr/invoices/files/abcdef12_a.xml' }]
  }
]
const ledger = exporter.ledgerCsv(list)
const header = ledger.split('\r\n')[0]
check('表头含价税合计', header.indexOf('价税合计') > 0, true)
check('表头含报销人', header.indexOf('报销人') > 0, true)
check('金额转成元', ledger.indexOf('147.00') > 0, true)
check('报销人逗号被转义', ledger.indexOf('"宁波,顺渝"') > 0, true)
check('不导出内部状态列', ['状态', '异常提示', '备注', '创建时间', '销方名称', '税额', '税率'].every(function (h) { return header.indexOf(h) < 0 }), true)

const qrLedger = exporter.ledgerCsv([{
  invoice_no: '26327000000459915366', invoice_type: '数电票',
  issue_date: '2026-03-05', total_cent: 29500,
  source: 'qr', reimburser: '', anomaly: ['报销人待补录'], note: '扫码草稿',
  status: 'unknown', created_at: Date.now()
}])
const qrCells = qrLedger.split('\r\n')[1].split(',')
check('扫码草稿报销人留空', qrCells[5], '')
check('扫码草稿价税合计保留', qrCells[4], '295.00')
check('扫码草稿来源保留', qrCells[6], 'qr')
check('内部信息不进 CSV', ['unknown', '报销人待补录', '扫码草稿'].every(function (s) { return qrLedger.indexOf(s) < 0 }), true)

console.log('\n--- 原件清单 CSV ---')
const manifest = exporter.manifestCsv(list)
check('表头含摘要算法', manifest.indexOf('摘要算法') > 0, true)
check('带文件名', manifest.indexOf('a.xml') > 0, true)
check('带本地路径', manifest.indexOf('/usr/invoices/files/') > 0, true)

console.log('\n--- 写文件 ---')
const path = exporter.writeCsv('台账.csv', ledger)
check('写到 export 目录', path.indexOf('/usr/invoices/export/') === 0, true)
check('文件名保留中文', /台账\.csv$/.test(path), true)
check('内容落盘完整', files[path], ledger)

console.log('\n--- 到期提醒 ---')
const expired = exporter.expiredFiles(30)
check('只报 40 天前的原件', expired.length, 1)
check('带天数', expired[0].ageDays, 40)
check('带路径', expired[0].name, 'aaaaaaaa_old.xml')
check('30 天内不报', exporter.expiredFiles(30).some(function (f) { return /fresh/.test(f.name) }), false)

console.log('\n--- 原件汇总 ---')
check('统计原件数', exporter.allFiles(list).length, 1)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
