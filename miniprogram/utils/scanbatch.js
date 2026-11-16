/**
 * 连续扫码：扫到用户取消为止，不做场次隔离，草稿统一进主台账。
 * 微信原生扫码界面不能加按钮，只能在进入前后给出明确的结束方式。
 */

const collect = require('./collect')
const store = require('./store')

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
    content: '点左上角 × 或手机返回键即可结束。扫到重复票会弹窗提醒，每扫 ' + CONFIRM_EVERY + ' 张会问一次是否继续。',
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

/** 重复由用户定夺：号码+日期+金额相同也可能只是某次扫错 */
function askDuplicate(where) {
  return modal({
    title: '这张票可能重复',
    content: '和' + where + '的票一样（号码 + 日期 + 金额）。要收下，还是跳过？',
    confirmText: '仍然收下',
    cancelText: '跳过'
  })
}

function isCancel(message) {
  return /cancel/i.test(message || '')
}

function feedback(count) {
  wx.showToast({ title: '已扫 ' + count + ' 张 · 点左上角×结束', icon: 'none', duration: 1200 })
  if (wx.vibrateShort) wx.vibrateShort({ type: 'light', fail: function () {} })
}

function done(drafts, cancelled, duplicates) {
  return { ok: true, drafts: drafts, cancelled: !!cancelled, duplicates: duplicates }
}

/** 本批次还没落库，重复要靠 seen 记；台账里的重复靠 store 查 */
function accept(draft, seen) {
  if (!draft.invoice_no) return { keep: true, where: '' }
  const key = store.dedupeKey(draft)
  if (seen[key]) return { keep: false, where: '本批次前面' }
  if (store.findDuplicate(draft)) return { keep: false, where: '台账里' }
  seen[key] = true
  return { keep: true, where: '' }
}

/** 无法识别的票提示后继续；相机等真失败停下来，避免死循环 */
function scanBatch() {
  const drafts = []
  const seen = {}
  let duplicates = 0

  function handle(draft) {
    const r = accept(draft, seen)
    if (r.keep) {
      drafts.push(draft)
      return Promise.resolve(true)
    }
    duplicates++
    return askDuplicate(r.where).then(function (keep) {
      if (keep) {
        seen[store.dedupeKey(draft)] = true
        drafts.push(draft)
      } else {
        wx.showToast({ title: '已跳过重复票', icon: 'none' })
      }
      return keep
    })
  }

  function next() {
    return collect.scanDraft().then(function (r) {
      if (r.ok) {
        return handle(r.draft).then(function (kept) {
          if (!kept) return next()
          feedback(drafts.length)
          if (drafts.length % CONFIRM_EVERY === 0) {
            return askContinue(drafts.length).then(function (go) {
              return go ? next() : done(drafts, true, duplicates)
            })
          }
          return next()
        })
      }
      if (isCancel(r.message)) return done(drafts, true, duplicates)
      if (SKIPPABLE.test(r.message || '')) {
        wx.showToast({ title: r.message, icon: 'none' })
        return next()
      }
      wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      return done(drafts, false, duplicates)
    })
  }
  return next()
}

module.exports = {
  notice: notice,
  scanBatch: scanBatch
}
