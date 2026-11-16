/**
 * 连续扫码：扫到用户取消为止，不做场次隔离，草稿统一进主台账。
 * 从 collect.js 拆出来，避免把单张扫码工具继续堆长。
 */

const collect = require('./collect')

const SKIPPABLE = /无法识别|链接型|字段不足/

function isCancel(message) {
  return /cancel/i.test(message || '')
}

function feedback(count) {
  wx.showToast({ title: '已扫 ' + count + ' 张', icon: 'none', duration: 800 })
  if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: function () {} })
}

function done(drafts, cancelled) {
  return { ok: true, drafts: drafts, cancelled: !!cancelled }
}

/** 无法识别的票提示后继续；相机等真失败停下来，避免死循环 */
function scanBatch() {
  const drafts = []
  function step() {
    return collect.scanDraft().then(function (r) {
      if (r.ok) {
        drafts.push(r.draft)
        feedback(drafts.length)
        return step()
      }
      if (isCancel(r.message)) return done(drafts, true)
      if (SKIPPABLE.test(r.message || '')) {
        wx.showToast({ title: r.message, icon: 'none' })
        return step()
      }
      wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      return done(drafts, false)
    })
  }
  return step()
}

module.exports = { scanBatch: scanBatch }
