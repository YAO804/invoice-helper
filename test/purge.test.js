/**
 * purge.js 回归测试：按导入时间区间筛选、按 id 删除、卡片勾选态。
 *
 *   node test/purge.test.js
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

const store = require('../miniprogram/utils/store')
const purge = require('../miniprogram/utils/purge')

store.setEnv({ root: '/usr/invoices', fileSystem: fs })
store.init()

function at(y, m, d) {
  return new Date(y, m - 1, d, 12, 0, 0).getTime()
}

const a = store.upsertInvoice({ invoice_no: '11111111', issue_date: '2026-01-01', total_cent: 10000, created_at: at(2026, 11, 10), seller_name: 'A' })
const b = store.upsertInvoice({ invoice_no: '22222222', issue_date: '2026-01-01', total_cent: 20000, created_at: at(2026, 11, 15), seller_name: 'B' })
const c = store.upsertInvoice({ invoice_no: '33333333', issue_date: '2026-01-01', total_cent: 30000, created_at: at(2026, 11, 20), seller_name: 'C' })

function nos(list) {
  return list.map(function (x) { return x.invoice_no }).sort()
}

console.log('--- 日期边界 ---')
check('当天起点', purge.dayStart('2026-11-15'), new Date(2026, 10, 15).getTime())
check('当天终点', purge.dayEnd('2026-11-15'), new Date(2026, 10, 15).getTime() + 86400000 - 1)
check('非法日期', purge.dayStart('bad'), null)

console.log('--- 按导入时间筛选 ---')
check('区间含首尾', nos(purge.inRange('2026-11-10', '2026-11-20')), ['11111111', '22222222', '33333333'])
check('单日只命中一张', nos(purge.inRange('2026-11-15', '2026-11-15')), ['22222222'])
check('空区间', purge.inRange('2026-11-16', '2026-11-19').length, 0)
check('起止颠倒', purge.inRange('2026-11-20', '2026-11-10').length, 0)
check('非法日期返回空', purge.inRange('bad', '2026-11-20').length, 0)

console.log('--- 汇总与卡片 ---')
check('区间金额', purge.totalText(purge.inRange('2026-11-10', '2026-11-20')), '600.00')
check('卡片勾选态', purge.cards([a, b], [b.id]).map(function (x) { return x.checked }), [false, true])

console.log('--- 按 id 删除 ---')
check('删掉两张', purge.removeIds([a.id, c.id]).deleted, 2)
check('重复删返回 0', purge.removeIds([a.id]).deleted, 0)
check('剩下一张', store.listInvoices({ sortBy: 'created' }).map(function (x) { return x.invoice_no }), ['22222222'])
check('删后区间金额', purge.totalText(purge.inRange('2026-11-10', '2026-11-20')), '200.00')

console.log('\n' + (failCount ? 'FAIL ' + failCount + ' 项' : '全部通过'))
process.exit(failCount ? 1 : 0)
