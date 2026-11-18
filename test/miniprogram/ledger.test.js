/**
 * ledger.js 回归测试：查询串拼装、远程快照映射、内存判重索引、重复组。
 * 用假 lanservice 喂数据，不连真实电脑。
 *
 *   node test/miniprogram/ledger.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

global.wx = { getStorageSync() { return '' }, setStorageSync() {} }

const ledger = require('../../miniprogram/utils/ledger')

console.log('--- 查询串 ---')
check('默认只带排序', ledger.buildQuery(), 'sort=created')
check('关键词编码', ledger.buildQuery({ keyword: '张三 147' }), 'keyword=' + encodeURIComponent('张三 147') + '&sort=created')
check('只看重复', ledger.buildQuery({ onlyDuplicates: true }), 'only_duplicates=1&sort=created')
check('只看待补录', ledger.buildQuery({ onlyNeedFill: true }), 'only_need_fill=1&sort=created')
check('排序透传', ledger.buildQuery({ sort: 'number' }), 'sort=number')
check('未知排序回落', ledger.buildQuery({ sort: 'whatever' }), 'sort=created')
check('空白关键词不拼', ledger.buildQuery({ keyword: '   ' }), 'sort=created')
check('批次只用于这一批回看', ledger.buildQuery({ batch: 'B1' }), 'batch=B1&sort=created')
check('录入时间同一天', ledger.buildQuery({ createdFrom: '2026-11-18', createdTo: '2026-11-18' }),
  'created_from=2026-11-18&created_to=2026-11-18&sort=created')
check('只给起始日期', ledger.buildQuery({ createdFrom: '2026-11-01' }), 'created_from=2026-11-01&sort=created')
check('组合条件顺序固定', ledger.buildQuery({
  keyword: 'N1', batch: 'B1', createdFrom: '2026-11-01', createdTo: '2026-11-18',
  onlyDuplicates: true, sort: 'issued'
}), 'keyword=N1&batch=B1&created_from=2026-11-01&created_to=2026-11-18&only_duplicates=1&sort=issued')

const remote = {
  items: [
    { id: 1, number: 'N1', code: 'C1', kind: '数电票', issue_date: '2026-08-01', total: '113.00', reimburser: '张三', batch: 'B1', created_at: '2026-11-18 08:00:00', duplicate: true, need_fill: false },
    { id: 2, number: 'N1', code: 'C1', kind: '数电票', issue_date: '2026-08-01', total: '113.00', reimburser: '', batch: 'B2', created_at: '2026-11-18 09:00:00', duplicate: true, need_fill: true },
    { id: 3, number: 'N2', code: '', kind: '普通发票', issue_date: '2026-07-01', total: '10.50', reimburser: '李四', batch: 'B1', created_at: '2026-11-17 08:00:00', duplicate: false, need_fill: false }
  ],
  duplicates: [{ number: 'N1', code: 'C1', items: [{ id: 1, number: 'N1', code: 'C1' }, { id: 2, number: 'N1', code: 'C1' }] }],
  total: 3,
  duplicate_groups: 1,
  need_fill: 1,
  latest_batch: 'B20261118-200000-001',
  latest_created_at: '2026-11-18 19:26:42'
}

let requestedQuery = ''
ledger.setEnv({
  lanservice: {
    fetchInvoices(query) {
      requestedQuery = query
      return Promise.resolve(remote)
    }
  }
})

async function main() {
  console.log('\n--- 同步快照 ---')
  const snap = await ledger.sync({ onlyDuplicates: true, sort: 'number' })
  check('透传查询串', requestedQuery, 'only_duplicates=1&sort=number')
  check('张数', snap.total, 3)
  check('合计元', snap.amountText, '236.50')
  check('重复组数', snap.duplicateGroups, 1)
  check('待补录数', snap.needFill, 1)
  check('最近录入日期只取日期部分', snap.latestCreatedAt, '2026-11-18')
  check('卡片字段齐全', snap.items[0].issueDate, '2026-08-01')
  check('卡片不带批次号', snap.items[0].batch, undefined)
  check('金额原样展示', snap.items[0].amount, '113.00')
  check('重复标记', snap.items[0].duplicate, true)
  check('待补录标记', snap.items[1].needFill, true)
  check('有同步时间', snap.syncedAt > 0, true)

  console.log('\n--- 判重索引 ---')
  check('代码+号码命中', ledger.findDuplicate({ code: 'C1', number: 'N1' }).id, 1)
  check('同号码不同代码不命中', ledger.findDuplicate({ code: 'C9', number: 'N1' }), null)
  check('无代码按号码命中', ledger.findDuplicate({ number: 'N2' }).id, 3)
  check('不存在的票', ledger.findDuplicate({ number: 'N404' }), null)

  console.log('\n--- 单条与重复组 ---')
  check('按 id 取', ledger.byId(2).batch, 'B2')
  check('取不到返回 null', ledger.byId(99), null)
  check('同组共 2 条', ledger.duplicateGroup(1).length, 2)
  check('非重复票没有组', ledger.duplicateGroup(3).length, 0)

  console.log('\n--- 清空 ---')
  ledger.clear()
  check('清空后为空', ledger.snapshot().total, 0)
  check('清空后无最近录入日期', ledger.snapshot().latestCreatedAt, '')
  check('清空后无索引', ledger.identityIndex(), {})

  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
