/**
 * 导出页选择逻辑回归：本次扫码标记、范围解析、自定义勾选、逐个转发。
 *
 *   node test/exportsel.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const files = {}
const dirs = {}
const storage = {}
let shared = []
let failNext = false

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
  setStorageSync(k, v) { storage[k] = v },
  shareFileMessage(opts) {
    shared.push(opts)
    if (failNext) return opts.fail && opts.fail({ errMsg: 'shareFileMessage:fail cancel' })
    return opts.success && opts.success()
  }
}

const store = require('../miniprogram/utils/store')
const batchmark = require('../miniprogram/utils/batchmark')
const exportsel = require('../miniprogram/utils/exportsel')
const exportflow = require('../miniprogram/utils/exportflow')

store.setEnv({ root: '/usr/invoices', fileSystem: fs })
store.init()

const a = store.upsertInvoice({ invoice_no: '11111111', issue_date: '2026-11-01', total_cent: 10000, batch_id: 'b1', seller_name: 'A' })
const b = store.upsertInvoice({ invoice_no: '22222222', issue_date: '2026-11-02', total_cent: 20000, batch_id: 'b1', seller_name: 'B' })
const c = store.upsertInvoice({ invoice_no: '33333333', issue_date: '2026-11-03', total_cent: 30000, seller_name: 'C' })

function ids(list) {
  return list.map(function (x) { return x.id }).sort(function (x, y) { return x - y })
}

console.log('--- 本次扫码标记 ---')
check('无标记默认全部', exportsel.defaultScope(), 'all')
batchmark.set('b1')
check('有标记默认本次', exportsel.defaultScope(), 'batch')
check('记录保留批次标记', [a.batch_id, b.batch_id, c.batch_id], ['b1', 'b1', ''])

console.log('--- 范围解析 ---')
check('本次扫码只含两张', ids(exportsel.resolve('batch', { basis: 'created' })), [a.id, b.id])
check('全部含三张', exportsel.resolve('all', { basis: 'created' }).length, 3)
check('自定义勾选', ids(exportsel.resolve('custom', { basis: 'created', ids: [a.id, c.id] })), [a.id, c.id])
check('无标记时本次为空', (batchmark.clear(), exportsel.resolve('batch', { basis: 'created' }).length), 0)
batchmark.set('b1')

console.log('--- 勾选态 ---')
check('卡片勾选态', exportsel.toCards([a, b], [a.id]).map(function (x) { return x.checked }), [true, false])

console.log('--- 逐个转发 ---')
shared = []
failNext = false
exportflow.run([
  { kind: 'csv', name: '台账.csv', text: 'a,b\n' },
  { kind: 'file', path: '/usr/x.xml', name: 'x.xml' }
]).then(function (r) {
  check('转发两个文件', shared.length, 2)
  check('首个是 CSV', shared[0].fileName, '台账.csv')
  check('第二个是原件', shared[1].fileName, 'x.xml')
  check('结果成功', r.ok, true)

  console.log('--- 取消即停 ---')
  shared = []
  failNext = true
  return exportflow.run([
    { kind: 'csv', name: '台账.csv', text: 'a,b\n' },
    { kind: 'file', path: '/usr/x.xml', name: 'x.xml' }
  ])
}).then(function (r) {
  check('用户取消', r.cancelled, true)
  check('只转发一个', shared.length, 1)
  check('后续未执行', r.ok, false)

  console.log('\n' + (failCount ? 'FAIL ' + failCount + ' 项' : '全部通过'))
  process.exit(failCount ? 1 : 0)
})
