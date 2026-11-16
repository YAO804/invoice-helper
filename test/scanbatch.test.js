/**
 * scanbatch.js 回归测试：进入说明、连续扫码、重复提示、定期确认、跳过无效码、相机失败中止。
 *
 *   node test/scanbatch.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const RAW_A = '01,31,,26932000001877489821,10500.00,20261110,,277D'
const RAW_B = '01,31,,26932000001295659876,147.00,20260802,,277D'

let queue = []
let modalAnswers = []
let modals = []
const toasts = []
let ledgerHasA = false

global.wx = {
  env: { USER_DATA_PATH: '/usr' },
  getFileSystemManager() {
    return {
      accessSync() {}, mkdirSync() {}, writeFileSync() {},
      readFileSync() { return '' }, readdirSync() { return [] }
    }
  },
  scanCode(opts) {
    const next = queue.shift()
    if (!next) return opts.fail({ errMsg: 'scanCode:fail cancel' })
    if (next.err) return opts.fail({ errMsg: next.err })
    return opts.success({ result: next.raw, scanType: 'qrCode', charSet: 'utf-8' })
  },
  showModal(opts) {
    modals.push(opts)
    const answer = modalAnswers.length ? modalAnswers.shift() : true
    return opts.success && opts.success({ confirm: answer })
  },
  showToast(o) { toasts.push(o.title) },
  vibrateShort() {},
  getStorageSync() { return undefined },
  setStorageSync() {}
}

const store = require('../miniprogram/utils/store')
const scanbatch = require('../miniprogram/utils/scanbatch')

// 台账查重走 store，这里只替换查重结果，不动其他逻辑
store.findDuplicate = function (inv) {
  return ledgerHasA && inv.invoice_no === '26932000001877489821' ? { id: 1 } : null
}

function run(items, answers) {
  queue = items.slice()
  toasts.length = 0
  modals = []
  modalAnswers = (answers || []).slice()
  return scanbatch.scanBatch()
}

function uniqueItems(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const no = '26932000001877000' + String(i).padStart(3, '0')
    out.push({ raw: '01,31,,' + no + ',10500.00,20261110,,277D' })
  }
  return out
}

console.log('--- 进入前说明 ---')
modalAnswers = [false]
scanbatch.notice().then(function (go) {
  check('点不扫了则不进入', go, false)
  modalAnswers = [true]
  return scanbatch.notice()
}).then(function (go) {
  check('点开始扫码则进入', go, true)

  console.log('--- 连续扫码 ---')
  return run([{ raw: RAW_A }, { raw: RAW_B }])
}).then(function (r) {
  check('扫到两张', r.drafts.length, 2)
  check('第一张号码', r.drafts[0].invoice_no, '26932000001877489821')
  check('第二张金额', r.drafts[1].total_cent, 14700)
  check('用户取消结束', r.cancelled, true)
  check('提示带退出方式', toasts[1], '已扫 2 张 · 点左上角×结束')

  console.log('--- 本批次重复：跳过 ---')
  // 第二张和第一张同号码同日期同金额，弹窗选「跳过」
  return run([{ raw: RAW_A }, { raw: RAW_A }], [false])
}).then(function (r) {
  check('只收下一张', r.drafts.length, 1)
  check('重复计数', r.duplicates, 1)
  check('弹窗说明本批次重复', modals[0].content.indexOf('本批次前面') >= 0, true)
  check('提示已跳过', toasts.indexOf('已跳过重复票') >= 0, true)

  console.log('--- 本批次重复：仍然收下 ---')
  return run([{ raw: RAW_A }, { raw: RAW_A }], [true])
}).then(function (r) {
  check('两张都收下', r.drafts.length, 2)
  check('重复仍计数', r.duplicates, 1)

  console.log('--- 台账已有重复 ---')
  ledgerHasA = true
  return run([{ raw: RAW_A }], [false]).then(function (r) {
    ledgerHasA = false
    return r
  })
}).then(function (r) {
  check('台账重复被跳过', r.drafts.length, 0)
  check('弹窗说明台账已有', modals[0].content.indexOf('台账里') >= 0, true)

  console.log('--- 每 10 张确认 ---')
  return run(uniqueItems(10), [false])
}).then(function (r) {
  check('扫满 10 张', r.drafts.length, 10)
  check('没有误判重复', r.duplicates, 0)
  check('点结束即停', r.cancelled, true)
  check('没有多扫第 11 张', queue.length, 0)

  console.log('--- 点继续扫 ---')
  return run(uniqueItems(11), [true])
}).then(function (r) {
  check('继续后扫到 11 张', r.drafts.length, 11)
  check('最终由取消结束', r.cancelled, true)

  console.log('--- 跳过无效二维码 ---')
  return run([{ raw: 'not-an-invoice' }, { raw: RAW_A }])
}).then(function (r) {
  check('无效码被跳过', r.drafts.length, 1)
  check('提示不可识别', toasts.indexOf('无法识别的二维码内容') >= 0, true)
  check('仍以取消结束', r.cancelled, true)

  console.log('--- 相机失败中止 ---')
  return run([{ err: 'scanCode:fail camera error' }])
}).then(function (r) {
  check('没有草稿', r.drafts.length, 0)
  check('不是用户取消', r.cancelled, false)
  check('提示真实错误', toasts[toasts.length - 1], '扫码失败：scanCode:fail camera error')

  console.log('\n' + (failCount ? 'FAIL ' + failCount + ' 项' : '全部通过'))
  process.exit(failCount ? 1 : 0)
})
