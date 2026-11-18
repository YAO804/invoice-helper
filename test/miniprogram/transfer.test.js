/**
 * 传输页回归测试：两个方向、分段切换、勾选、删除、保留期、接收文件。
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

/** 等一拍微任务+定时器，让页面里的 Promise 链落定 */
function tick(count) {
  const times = count || 1
  return new Promise(function (resolve) {
    let left = times
    const step = function () {
      left -= 1
      if (left <= 0) return resolve()
      setTimeout(step, 0)
    }
    setTimeout(step, 0)
  })
}

const storage = {}
let toasts = []
let modalConfirm = true
let sheetIndex = 0
let downloaded = []
let shared = []
let opened = []

let incomingFiles = [
  { id: 'r1', name: 'a.xml', size: 100, uploaded_at: '2026-11-18T00:43:27Z', source: 'miniprogram' },
  { id: 'r2', name: 'b.ofd', size: 200, uploaded_at: '2026-11-17T02:00:00Z', source: 'ledger' }
]
let outgoingFiles = [
  { name: '报销单.pdf', size: 4096, modified_at: '2026-11-18T01:00:00Z' },
  { name: '汇总.ofd', size: 2048, modified_at: '2026-11-17T01:00:00Z' }
]

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  showToast(options) { toasts.push(options.title) },
  showModal(options) { if (modalConfirm && options.success) options.success({ confirm: true }) },
  showLoading() {},
  hideLoading() {},
  showActionSheet(options) {
    if (options.success) options.success({ tapIndex: sheetIndex })
  },
  downloadFile(options) {
    downloaded.push(options.url)
    // 临时路径按文件名生成，断言才不依赖下载次数
    const encoded = options.url.split('/').slice(-2)[0]
    options.success({ statusCode: 200, tempFilePath: '/tmp/' + decodeURIComponent(encoded) })
  },
  openDocument(options) {
    opened.push(options.filePath)
    options.success({})
  },
  shareFileMessage(options) {
    shared.push(options.fileName)
    options.success({})
  },
  request(options) {
    if (options.url.indexOf('/api/files') >= 0) {
      return options.success({ statusCode: 200, data: { incoming: incomingFiles, outgoing: outgoingFiles } })
    }
    if (options.url.indexOf('/api/incoming/purge') >= 0) {
      return options.success({ statusCode: 200, data: { removed: 1, confirmed: options.data.confirm } })
    }
    if (options.url.indexOf('/api/outgoing/purge') >= 0) {
      return options.success({ statusCode: 200, data: { removed: 2, confirmed: options.data.confirm } })
    }
    if (options.url.indexOf('/api/outgoing') >= 0 && options.method === 'DELETE') {
      const names = options.data.names || []
      return options.success({ statusCode: 200, data: { deleted: names.length || 2 } })
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
    listFiles() { return Promise.resolve({ incoming: incomingFiles, outgoing: outgoingFiles }) }
  }
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
check('默认方向为发到电脑', page.data.direction, 'to')
check('默认分段为本机记录', page.data.tab, 'sent')
check('当前条数', page.data.currentCount, 2)

page.onToggle({ currentTarget: { dataset: { id: 'f2' } } })
check('勾选后记录 id', page.data.selectedIds, ['f2'])
check('勾选后条目带 checked', page.data.history.filter(function (e) { return e.id === 'f2' })[0].checked, true)

page.onToggleAll()
check('全选包含两条', page.data.selectedIds.length, 2)
check('全选后 allSelected', page.data.allSelected, true)

page.onDelete({ currentTarget: { dataset: { all: 'no' } } })

tick().then(function () {
  check('删除后本机只剩空', page.data.history.length, 0)
  check('删除提示', toasts[toasts.length - 1], '已删除 2 条记录')

  page.onTab({ currentTarget: { dataset: { tab: 'remote' } } })
  check('切到电脑已收', page.data.tab, 'remote')
  check('切分段清空勾选', page.data.selectedIds, [])
  check('切分段换量词', page.data.noun, '个文件')
  return tick()
}).then(function () {
  check('电脑端文件数', page.data.remote.length, 2)
  check('电脑端文件带大小', page.data.remote[0].humanSize, '100 B')
  check('电脑端文件 checked 默认 false', page.data.remote[0].checked, false)

  page.onToggle({ currentTarget: { dataset: { id: 'r1' } } })
  check('电脑端勾选', page.data.selectedIds, ['r1'])

  page.onDelete({ currentTarget: { dataset: { all: 'no' } } })
  return tick()
}).then(function () {
  check('电脑端删除提示', toasts[toasts.length - 1], '已删除 1 个文件')

  page.onTab({ currentTarget: { dataset: { tab: 'sent' } } })
  page.onPurgeOld()
  check('本机无超期记录时的提示', toasts[toasts.length - 1], '没有超过 30 天的记录')

  page.onTab({ currentTarget: { dataset: { tab: 'remote' } } })
  page.onPurgeOld()
  return tick(2)
}).then(function () {
  check('超期清理走预览后确认', toasts[toasts.length - 1], '已清理 1 个接收文件')

  // ---------- 从电脑取 ----------
  page.onDirection({ currentTarget: { dataset: { direction: 'from' } } })
  check('切到从电脑取', page.data.direction, 'from')
  check('切方向清空勾选', page.data.selectedIds, [])
  check('从电脑取量词', page.data.noun, '个文件')
  return tick()
}).then(function () {
  check('待取文件数', page.data.offer.length, 2)
  check('待取文件带大小', page.data.offer[0].humanSize, '4.0 KB')
  check('待取文件 id 用文件名', page.data.offer[0].id, '报销单.pdf')
  check('待取文件可预览标记', page.data.offer.map(function (f) { return f.previewable }), [true, false])
  check('当前列表切到待取', page.data.currentCount, 2)

  sheetIndex = 0
  page.onReceiveOne({ currentTarget: { dataset: { name: '报销单.pdf' } } })
  return tick(3)
}).then(function () {
  check('下载走待取下载接口', downloaded[0], 'http://192.168.1.20:8765/api/outgoing/' + encodeURIComponent('报销单.pdf') + '/download')
  check('转发到聊天带文件名', shared, ['报销单.pdf'])
  check('接收后提示', toasts[toasts.length - 1], '已转发到聊天')

  sheetIndex = 1
  page.onReceiveOne({ currentTarget: { dataset: { name: '报销单.pdf' } } })
  return tick(3)
}).then(function () {
  check('选预览时打开本地临时文件', opened, ['/tmp/报销单.pdf'])
  check('预览成功提示', toasts[toasts.length - 1], '已打开')

  sheetIndex = 1
  page.onReceiveOne({ currentTarget: { dataset: { name: '汇总.ofd' } } })
  return tick(3)
}).then(function () {
  check('OFD 不给预览，仍按转发处理', shared, ['报销单.pdf', '汇总.ofd'])
  check('OFD 不触发 openDocument', opened.length, 1)

  page.onToggle({ currentTarget: { dataset: { id: '汇总.ofd' } } })
  check('待取文件勾选', page.data.selectedIds, ['汇总.ofd'])
  page.onDelete({ currentTarget: { dataset: { all: 'no' } } })
  return tick(2)
}).then(function () {
  check('删除待取文件提示', toasts[toasts.length - 1], '已删除 1 个文件')

  page.onPurgeOld()
  return tick(2)
}).then(function () {
  check('待取文件按修改时间清理', toasts[toasts.length - 1], '已清理 2 个待取文件')

  page.onDelete({ currentTarget: { dataset: { all: 'all' } } })
  return tick(2)
}).then(function () {
  check('全部删除待取文件', toasts[toasts.length - 1], '已删除 2 个文件')

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
