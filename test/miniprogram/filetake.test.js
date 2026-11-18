/**
 * 从电脑取文件：格式判断、列表映射、下载地址、批量接收的容错。
 *
 *   node test/miniprogram/filetake.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

let downloads = []
let shared = []
let brokenNames = []

const storage = { desktop_base_url: 'http://192.168.1.20:8765' }

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  showToast() {},
  showModal(options) { if (options.success) options.success({ confirm: true }) },
  shareFileMessage(options) {
    shared.push(options.fileName)
    options.success({})
  },
  downloadFile(options) {
    const name = decodeURIComponent(options.url.split('/').slice(-2)[0])
    downloads.push(name)
    if (brokenNames.indexOf(name) >= 0) return options.fail({ errMsg: 'downloadFile:fail timeout' })
    options.success({ statusCode: 200, tempFilePath: '/tmp/' + name })
  }
}

const lanservice = require('../../miniprogram/utils/lanservice')
const filetake = require('../../miniprogram/utils/filetake')

// 假 lanservice：只提供 filetake 需要的那几个接口，避免走真实网络分支
const fakeLan = {
  getBase() { return 'http://192.168.1.20:8765' },
  outgoingURL: lanservice.outgoingURL,
  deleteOutgoing(names) {
    return Promise.resolve({ deleted: (names || []).length || 3 })
  },
  purgeOutgoing(days, confirm) {
    return Promise.resolve({ removed: 2, confirmed: !!confirm, days: days })
  },
  listFiles() {
    return Promise.resolve({
      incoming: [],
      outgoing: [
        { name: '报销单.pdf', size: 4096, modified_at: '2026-11-18T01:00:00Z' },
        { name: '汇总.OFD', size: 2048, modified_at: '2026-11-17T01:00:00Z' }
      ]
    })
  }
}
filetake.setEnv({ wx: global.wx, lanservice: fakeLan })

check('取扩展名', filetake.ext('a.PDF'), 'pdf')
check('无扩展名', filetake.ext('noext'), '')
check('点结尾不算扩展名', filetake.ext('a.'), '')
check('pdf 可预览', filetake.canPreview('发票.pdf'), true)
check('大写 DOCX 可预览', filetake.canPreview('说明.DOCX'), true)
check('OFD 不可预览', filetake.canPreview('发票.ofd'), false)
check('zip 不可预览', filetake.canPreview('打包.zip'), false)
check('xml 不可预览', filetake.canPreview('a.xml'), false)
check('下载地址编码中文', lanservice.outgoingURL('报销单.pdf'),
  'http://192.168.1.20:8765/api/outgoing/' + encodeURIComponent('报销单.pdf') + '/download')

filetake.list().then(function (list) {
  check('列表用文件名当 id', list.map(function (f) { return f.id }), ['报销单.pdf', '汇总.OFD'])
  check('列表带可读大小', list[0].humanSize, '4.0 KB')
  check('列表带本地时间', list[0].timeText.length, 11)
  check('列表带预览标记', list.map(function (f) { return f.previewable }), [true, false])

  return filetake.download('报销单.pdf')
}).then(function (path) {
  check('下载落到临时文件', path, '/tmp/报销单.pdf')
  check('下载请求打到待取接口', downloads, ['报销单.pdf'])

  return filetake.download('').then(function () {
    check('空文件名应当被拒绝', true, false)
  }, function (err) {
    check('空文件名报错', err.message.indexOf('电脑') >= 0, true)
  })
}).then(function () {
  return filetake.takeAndShare(['报销单.pdf', '汇总.OFD'])
}).then(function (r) {
  check('批量接收条数', r.count, 2)
  check('批量接收逐个转发', shared, ['报销单.pdf', '汇总.OFD'])
  check('批量接收无失败', r.failed, [])

  brokenNames = ['汇总.OFD']
  return filetake.takeAndShare(['报销单.pdf', '汇总.OFD'])
}).then(function (r) {
  check('单个下载失败不影响其余', r.count, 1)
  check('失败名单', r.failed, ['汇总.OFD'])
  check('成功的那个仍然转发', shared, ['报销单.pdf', '汇总.OFD', '报销单.pdf'])

  brokenNames = ['报销单.pdf', '汇总.OFD']
  return filetake.takeAndShare(['报销单.pdf', '汇总.OFD'])
}).then(function (r) {
  check('全部失败时不弹转发', r.ok, false)
  check('全部失败时的文案', r.message, '全部下载失败')

  brokenNames = []
  return filetake.takeAndShare([])
}).then(function (r) {
  check('没勾选时直接返回', r.message, '没有可接收的文件')

  return filetake.remove(['报销单.pdf'])
}).then(function (res) {
  check('删除指定待取文件', res.deleted, 1)

  return filetake.remove([])
}).then(function (res) {
  check('不传文件名表示全部删除', res.deleted, 3)

  return filetake.purge(30, false)
}).then(function (res) {
  check('清理默认只预览', res.confirmed, false)
  check('清理带保留天数', res.days, 30)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
