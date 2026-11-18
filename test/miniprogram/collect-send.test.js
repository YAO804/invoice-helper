/**
 * 收票页发送成功回看闭环：弹窗给入口，批次号交给台账页。
 *
 *   node test/miniprogram/collect-send.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

let modal = null
let navigated = null
global.wx = {
  getStorageSync() { return '' },
  setStorageSync() {},
  showModal(o) { modal = o },
  showToast() {},
  switchTab(o) { navigated = o.url },
  scanCode() {},
  chooseMessageFile() {},
  getFileSystemManager() { return { readFileSync() { return '' } } }
}

let pageConfig = null
global.Page = function (config) { pageConfig = config }
require('../../miniprogram/pages/collect/collect')

const app = { globalData: {} }
global.getApp = function () { return app }

const that = { syncLedger() {} }

console.log('--- 有批次号：给一键回看 ---')
pageConfig.showSentResult.call(that, { sent: 3, batch: 'B-BATCH-001', skipped: 1 })
check('确认按钮是查看这批票', modal.confirmText, '查看这批票')
check('取消按钮是稍后', modal.cancelText, '稍后')
check('文案含成功张数', modal.content.indexOf('成功发送 3 张') === 0, true)
check('文案含跳过重复', modal.content.indexOf('跳过重复 1 张') > 0, true)
check('文案不含批次号（内部概念不露给用户）', modal.content.indexOf('B-BATCH-001'), -1)

modal.success({ confirm: true })
check('批次号交给台账页', app.globalData.pendingBatch, 'B-BATCH-001')
check('跳到台账页', navigated, '/pages/list/list')

console.log('\n--- 点稍后：不跳不走 ---')
app.globalData.pendingBatch = ''
navigated = null
modal.success({ confirm: false })
check('不写批次', app.globalData.pendingBatch, '')
check('不跳转', navigated, null)

console.log('\n--- 无批次号：保持单按钮 ---')
modal = null
pageConfig.showSentResult.call(that, { sent: 1 })
check('只有一个按钮', modal.showCancel, false)
modal.success({ confirm: true })
check('不写批次', app.globalData.pendingBatch, '')
check('不跳转', navigated, null)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
