/**
 * 连续扫码：扫到用户取消为止，不做场次隔离，草稿统一进主台账。
 * 微信原生扫码界面不能加按钮，只能在进入前后给出明确的结束方式。
 */

const collect = require('./collect')

const SKIPPABLE = /无法识别|链接型|字段不足/
const CONFIRM_EVERY = 10

function modal(options) {
  return new Promise(function (resolve) {
    wx.showModal(Object.assign({
      success: function (r) { resolve(!!r.confirm) },
      fail: function () { resolve(false) }
    }, options))
  })
}

/** 原生扫码界面只有左上角 × 能退出，进之前先讲清楚 */
function notice() {
  return modal({
    title: '批量扫码',
    content: '扫码时点左上角 × 或手机返回键即可结束。每扫 ' + CONFIRM_EVERY + ' 张会问一次是否继续。',
    confirmText: '开始扫码',
    cancelText: '不扫了'
  })
}

/** 定期给一个明确的结束按钮，避免用户找不到原生界面的 × */
function askContinue(count) {
  return modal({
    title: '已扫 ' + count + ' 张',
    content: '继续扫码，还是结束并保存？',
    confirmText: '继续扫',
    cancelText: '结束'
  })
}

function isCancel(message) {
  return /cancel/i.test(message || '')
}

function feedback(count) {
  wx.showToast({ title: '已扫 ' + count + ' 张 · 点左上角×结束', icon: 'none', duration: 1200 })
  if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: function () {} })
}

function done(drafts, cancelled) {
  return { ok: true, drafts: drafts, cancelled: !!cancelled }
}

/** 无法识别的票提示后继续；相机等真失败停下来，避免死循环 */
function scanBatch() {
  const drafts = []
  function next() {
    return collect.scanDraft().then(function (r) {
      if (r.ok) {
        drafts.push(r.draft)
        feedback(drafts.length)
        if (drafts.length % CONFIRM_EVERY === 0) {
          return askContinue(drafts.length).then(function (go) {
            return go ? next() : done(drafts, true)
          })
        }
        return next()
      }
      if (isCancel(r.message)) return done(drafts, true)
      if (SKIPPABLE.test(r.message || '')) {
        wx.showToast({ title: r.message, icon: 'none' })
        return next()
      }
      wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      return done(drafts, false)
    })
  }
  return next()
}

module.exports = {
  notice: notice,
  scanBatch: scanBatch
}
