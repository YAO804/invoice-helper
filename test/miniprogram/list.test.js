/**
 * 台账页回归测试：未连接空状态、远程渲染、筛选与排序请求、错误兜底、进详情。
 * 用假 Page + 假 wx 直接驱动页面方法。
 *
 *   node test/miniprogram/list.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = {}
let navigations = []
let queries = []
let remoteError = null

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  navigateTo(o) { navigations.push(o.url) },
  switchTab(o) { navigations.push(o.url) },
  stopPullDownRefresh() {},
  showToast() {}
}

const remote = {
  items: [
    { id: 7, number: 'N7', code: 'C7', kind: '数电票', issue_date: '2026-08-01', total: '113.00', reimburser: '张三', batch: 'B1', created_at: '2026-11-18 08:00:00', duplicate: true, need_fill: false },
    { id: 8, number: 'N8', code: '', kind: '普通发票', issue_date: '2026-07-01', total: '10.50', reimburser: '', batch: 'B1', created_at: '2026-11-17 08:00:00', duplicate: false, need_fill: true }
  ],
  duplicates: [{ number: 'N7', code: 'C7', items: [{ id: 7 }] }],
  total: 2,
  duplicate_groups: 1,
  need_fill: 1
}

const ledger = require('../../miniprogram/utils/ledger')
ledger.setEnv({
  lanservice: {
    fetchInvoices(query) {
      queries.push(query)
      if (remoteError) return Promise.reject(new Error(remoteError))
      return Promise.resolve(remote)
    }
  }
})

let pageConfig = null
global.Page = function (config) { pageConfig = config }
require('../../miniprogram/pages/list/list')

function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) {
    // 页面里用 Object.assign 合并，这里等价模拟，避免嵌套字段被整体替换
    Object.assign(this.data, patch)
  }
  return page
}

async function main() {
  console.log('--- 未连接 ---')
  let page = newPage()
  await page.refresh()
  check('标记未连接', page.data.connected, false)
  check('不请求电脑', queries.length, 0)
  check('列表为空', page.data.items.length, 0)
  check('统计归零', page.data.total, 0)

  console.log('\n--- 已连接：渲染 ---')
  storage.desktop_base_url = 'http://192.168.1.20:8765'
  page = newPage()
  await page.refresh()
  check('标记已连接', page.data.connected, true)
  check('首次请求排序参数', queries[0], 'sort=created')
  check('渲染两条', page.data.items.length, 2)
  check('号码', page.data.items[0].number, 'N7')
  check('合计元', page.data.amountText, '123.50')
  check('重复组数', page.data.duplicateGroups, 1)
  check('待补录数', page.data.needFill, 1)
  check('有同步时间文案', page.data.syncedText.indexOf('更新于') === 0, true)
  check('初始无筛选', page.data.hasFilter, false)

  console.log('\n--- 筛选 ---')
  page.onToggleDuplicates()
  check('仅看重复写入状态', page.data.onlyDuplicates, true)
  check('仅看重复进查询串', queries[queries.length - 1], 'only_duplicates=1&sort=created')
  check('有筛选标记', page.data.hasFilter, true)

  page.onToggleNeedFill()
  check('待补录进查询串', queries[queries.length - 1], 'only_duplicates=1&only_need_fill=1&sort=created')

  page.onReset()
  check('重置清空开关', page.data.onlyDuplicates || page.data.onlyNeedFill, false)
  check('重置清空关键词', page.data.keyword, '')
  check('重置后无筛选标记', page.data.hasFilter, false)
  await new Promise(function (r) { setTimeout(r, 0) })
  check('重置重新查询', queries[queries.length - 1], 'sort=created')

  console.log('\n--- 排序 ---')
  page.onSortChange({ currentTarget: { dataset: { sort: 'issued' } } })
  await new Promise(function (r) { setTimeout(r, 0) })
  check('排序状态', page.data.sort, 'issued')
  check('排序进查询串', queries[queries.length - 1], 'sort=issued')
  check('高亮跟着换', page.data.sorts.filter(function (s) { return s.on }).map(function (s) { return s.value }), ['issued'])

  console.log('\n--- 关键词（防抖）---')
  page.onKeywordInput({ detail: { value: ' 张三 ' } })
  check('关键词立刻写入状态', page.data.keyword, ' 张三 ')
  check('防抖期间不发请求', queries[queries.length - 1], 'sort=issued')
  await new Promise(function (r) { setTimeout(r, 400) })
  check('停顿后带关键词查询', queries[queries.length - 1], 'keyword=' + encodeURIComponent('张三') + '&sort=issued')

  console.log('\n--- 错误兜底 ---')
  remoteError = 'HTTP 500'
  await page.load()
  check('清空列表', page.data.items.length, 0)
  check('给出错误文案', page.data.error, 'HTTP 500')
  remoteError = null

  console.log('\n--- 跳转 ---')
  navigations = []
  page.onOpenDetail({ currentTarget: { dataset: { id: 7 } } })
  page.onConnect()
  page.onCollect()
  check('详情带 id', navigations[0], '/pages/detail/detail?id=7')
  check('设置用 switchTab', navigations[1], '/pages/settings/settings')
  check('收票用 switchTab', navigations[2], '/pages/collect/collect')

  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}

main().catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
