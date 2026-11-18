/**
 * 传输页回归测试：分段切换、勾选、删除、30 天保留期。
 * 用假 Page + 假 wx 直接驱动页面方法，不依赖开发者工具。
 *
 *   node test/miniprogram/transfer.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = {}
let toasts = []
let modalConfirm = true
let remoteFiles = [
  { id: 'r1', name: 'a.xml', size: 100, uploaded_at: '2026-11-18T00:43:27Z', source: 'miniprogram' },
  { id: 'r2', name: 'b.ofd', size: 200, uploaded_at: '2026-11-17T02:00:00Z', source: 'ledger' }
]

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  showToast(options) { toasts.push(options.title) },
  showModal(options) { if (modalConfirm && options.success) options.success({ confirm: true }) },
  request(options) {
    if (options.url.indexOf('/api/files') >= 0) {
      return options.success({ statusCode: 200, data: { incoming: remoteFiles, outgoing: [] } })
    }
    if (options.url.indexOf('/api/incoming/purge') >= 0) {
      return options.success({ statusCode: 200, data: { removed: 1, confirmed: options.data.confirm } })
    }
    if (options.url.indexOf('/api/incoming') >= 0) {
      return options.success({ statusCode: 200, data: { deleted: (options.data.ids || []).length || 1 } })
    }
    options.success({ statusCode: 200, data: { ok: true } })
  }
}

const filesend = require('../../miniprogram/utils/filesend')
filesend.setEnv({
  wx: global.wx,
  lanservice: {
    getBase() { return 'http://192.168.1.20:8765' },
    listFiles() { return Promise.resolve({ incoming: remoteFiles, outgoing: [] }) }
  },
  store: { listInvoices() { return [] } }
})

let pageConfig = null
global.Page = function (config) { pageConfig = config }
require('../../miniprogram/pages/transfer/transfer')

function newPage() {
  const page = Object.assign({}, pageConfig)
  page.data = JSON.parse(JSON.stringify(pageConfig.data))
  page.setData = function (patch) { Object.assign(this.data, patch) }
  return page
}

const day = 24 * 60 * 60 * 1000
const now = Date.now()
storage.file_send_history = [
  { id: 'f1', name: 'old.xml', size: 10, status: 'ok', source: 'miniprogram', at: now - 40 * day },
  { id: 'f2', name: 'a.xml', size: 100, status: 'ok', source: 'miniprogram', at: now - day },
  { id: 'f3', name: 'b.ofd', size: 200, status: 'duplicate', source: 'ledger', at: now - 2 * day }
]
storage.desktop_base_url = 'http://192.168.1.20:8765'

const page = newPage()
page.onShow()

check('打开时丢掉超期记录', filesend.history().length, 2)
check('只展示保留期内记录', page.data.history.map(function (e) { return e.id }), ['f2', 'f3'])
check('连接状态', page.data.connected, true)
check('默认分段为本机记录', page.data.tab, 'sent')
check('当前条数', page.data.currentCount, 2)

page.onToggle({ currentTarget: { dataset: { id: 'f2' } } })
check('勾选后记录 id', page.data.selectedIds, ['f2'])
check('勾选后条目带 checked', page.data.history.filter(function (e) { return e.id === 'f2' })[0].checked, true)

page.onToggleAll()
check('全选包含两条', page.data.selectedIds.length, 2)
check('全选后 allSelected', page.data.allSelected, true)

page.onDeleteSelected()
check('删除后本机只剩空', page.data.history.length, 0)
check('删除提示', toasts[toasts.length - 1], '已删除 2 条记录')

page.onTab({ currentTarget: { dataset: { tab: 'remote' } } })
check('切到电脑已收', page.data.tab, 'remote')
check('切分段清空勾选', page.data.selectedIds, [])
check('切分段换量词', page.data.noun, '个文件')

// onShow 会自动拉一次电脑端列表，等它落定再断言
new Promise(function (resolve) { setTimeout(resolve, 0) }).then(function () {
  check('电脑端文件数', page.data.remote.length, 2)
  check('电脑端文件带大小', page.data.remote[0].humanSize, '100 B')
  check('电脑端文件 checked 默认 false', page.data.remote[0].checked, false)

  page.onToggle({ currentTarget: { dataset: { id: 'r1' } } })
  check('电脑端勾选', page.data.selectedIds, ['r1'])

  page.onDeleteSelected()
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}).then(function () {
  check('电脑端删除提示', toasts[toasts.length - 1], '已删除 1 个文件')

  page.onTab({ currentTarget: { dataset: { tab: 'sent' } } })
  page.onPurgeOld()
  check('本机无超期记录时的提示', toasts[toasts.length - 1], '没有超过 30 天的记录')

  page.onTab({ currentTarget: { dataset: { tab: 'remote' } } })
  page.onPurgeOld()
  return new Promise(function (resolve) { setTimeout(resolve, 0) })
}).then(function () {
  check('超期清理走预览后确认', toasts[toasts.length - 1], '已清理 1 个文件')

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
