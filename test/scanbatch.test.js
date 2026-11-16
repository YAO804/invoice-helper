/**
 * scanbatch.js 回归测试：进入说明、连续扫码、定期确认、跳过无效码、相机失败中止。
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
const toasts = []

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
    const answer = modalAnswers.length ? modalAnswers.shift() : true
    return opts.success && opts.success({ confirm: answer })
  },
  showToast(o) { toasts.push(o.title) },
  vibrateShort() {},
  getStorageSync() { return undefined },
  setStorageSync() {}
}

const scanbatch = require('../miniprogram/utils/scanbatch')

function run(items, answers) {
  queue = items.slice()
  toasts.length = 0
  modalAnswers = (answers || []).slice()
  return scanbatch.scanBatch()
}

function rawItems(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push({ raw: RAW_A })
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

  console.log('--- 每 10 张确认 ---')
  return run(rawItems(10), [false])
}).then(function (r) {
  check('扫满 10 张', r.drafts.length, 10)
  check('点结束即停', r.cancelled, true)
  check('没有多扫第 11 张', queue.length, 0)

  console.log('--- 点继续扫 ---')
  return run(rawItems(11), [true])
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
