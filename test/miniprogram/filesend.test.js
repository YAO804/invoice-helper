/**
 * filesend.js 回归测试：原件传输、本地历史、失败隔离、台账去重。
 *
 *   node test/miniprogram/filesend.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = {}
let uploads = []
let uploadFailNames = []
let uploadDupNames = []

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  chooseMessageFile(opts) {
    opts.success({ tempFiles: [
      { path: '/tmp/a', name: 'a.xml', size: 100 },
      { path: '/tmp/b', name: 'b.ofd', size: 200 }
    ] })
  }
}

const fakeLan = {
  getBase() { return 'http://192.168.1.20:8765' },
  uploadFile(path, name, source) {
    uploads.push({ path: path, name: name, source: source })
    if (uploadFailNames.indexOf(name) >= 0) return Promise.reject(new Error('网络中断'))
    const size = name === 'b.ofd' ? 200 : 100
    return Promise.resolve({
      name: name,
      size: size,
      duplicate: uploadDupNames.indexOf(name) >= 0,
      sha256: 'abcdef1234567890',
      source: source
    })
  },
  listFiles() {
    return Promise.resolve({ incoming: [{ id: 'r1', name: 'a.xml', size: 100 }], outgoing: [] })
  }
}

const fakeStore = {
  listInvoices() {
    return [
      { invoice_no: 'N1', files: [
        { path: '/i/1_a.xml', name: 'a.xml', size: 100, digest: 'd1' },
        { path: '/i/2_b.pdf', name: 'b.pdf', size: 200, digest: 'd2' }
      ] },
      { invoice_no: 'N2', files: [
        { path: '/i/3_a.xml', name: 'a.xml', size: 100, digest: 'd1' }
      ] }
    ]
  }
}

const filesend = require('../../miniprogram/utils/filesend')
filesend.setEnv({ wx: global.wx, lanservice: fakeLan, store: fakeStore })

check('human B', filesend.human(512), '512 B')
check('human KB', filesend.human(2048), '2.0 KB')
check('human MB', filesend.human(3 * 1024 * 1024), '3.00 MB')

const ledger = filesend.ledgerFiles()
check('台账原件按 digest 去重后 2 个', ledger.length, 2)
check('台账原件带发票号码', ledger[0].invoiceNo, 'N1')

filesend.sendList([
  { path: '/tmp/a', name: 'a.xml', size: 100 },
  { path: '/tmp/b', name: 'b.ofd', size: 200 }
], 'miniprogram').then(function (r) {
  check('上传总数', r.total, 2)
  check('上传成功数', r.ok, 2)
  check('上传字段 file 名与来源', uploads[0], { path: '/tmp/a', name: 'a.xml', source: 'miniprogram' })
  check('历史写入 2 条', filesend.history().length, 2)
  check('历史最新在前', filesend.history()[0].name, 'b.ofd')
  check('历史含可读大小', filesend.displayHistory()[0].humanSize, '200 B')
  check('历史含状态文案', filesend.displayHistory()[0].statusLabel, '已送达')

  uploads = []
  uploadDupNames = ['a.xml']
  uploadFailNames = ['b.ofd']
  return filesend.sendFromChat()
}).then(function (r) {
  check('混合结果总数', r.total, 2)
  check('混合结果成功', r.ok, 0)
  check('混合结果重复', r.duplicate, 1)
  check('混合结果失败', r.fail, 1)
  check('会话文件名清洗', uploads[0].name, 'a.xml')
  check('失败不中断后续上传', uploads.length, 2)

  const hist = filesend.history()
  check('历史累计 4 条', hist.length, 4)
  const failEntry = hist.filter(function (e) { return e.name === 'b.ofd' && e.status === 'fail' })[0]
  check('失败条目含原因', failEntry.message, '网络中断')

  filesend.clearHistory()
  check('清空历史', filesend.history().length, 0)

  return filesend.remoteFiles()
}).then(function (r) {
  check('电脑端列表 incoming', r.incoming.length, 1)
  check('电脑端列表 outgoing', r.outgoing.length, 0)
  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
