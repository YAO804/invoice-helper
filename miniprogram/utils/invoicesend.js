const lanservice = require('./lanservice')
const draft = require('./draft')

const MAX_SEND = 200

function matchText(match) {
  return '价税合计 ' + (match.total || '-') + ' / ' + (match.issue_date || '-')
}

function confirmDuplicates(matches) {
  const numbers = Object.keys(matches)
  return new Promise(function (resolve) {
    const lines = numbers.slice(0, 4).map(function (number) {
      return number + '（' + matchText(matches[number]) + '）'
    })
    const more = numbers.length > 4 ? '\n……另有 ' + (numbers.length - 4) + ' 张' : ''

    wx.showModal({
      title: '发现重复发票',
      content: '本次有 ' + numbers.length + ' 张发票号码已存在于电脑台账。\n' + lines.join('\n') + more,
      confirmText: '仍然发送',
      cancelText: '跳过重复',
      success: function (r) { resolve(!!r.confirm) },
      fail: function () { resolve(false) }
    })
  })
}

function confirmLimit(count) {
  return new Promise(function (resolve) {
    wx.showModal({
      title: '超出单次发送限制',
      content: '电脑端单次最多接收 ' + MAX_SEND + ' 张，本次共有 ' + count + ' 张。将只发送前 ' + MAX_SEND + ' 张，剩余 ' + (count - MAX_SEND) + ' 张不会发送。',
      confirmText: '发送前 ' + MAX_SEND + ' 张',
      cancelText: '取消',
      success: function (r) { resolve(!!r.confirm) },
      fail: function () { resolve(false) }
    })
  })
}

function postList(list, left) {
  return lanservice.sendInvoices(list).then(function (result) {
    return {
      sent: result.added || 0,
      skipped: 0,
      batch: result.batch || '',
      left: left
    }
  })
}

function sendChecked(invoices, left) {
  return lanservice.checkInvoices(invoices).then(function (result) {
    const matches = result.matches || {}
    if (!Object.keys(matches).length) return postList(invoices, left)

    return confirmDuplicates(matches).then(function (keepAll) {
      if (keepAll) return postList(invoices, left)
      const kept = invoices.filter(function (invoice) {
        return !matches[invoice.number]
      })
      if (!kept.length) {
        return { sent: 0, skipped: invoices.length, batch: '', left: left }
      }
      return postList(kept, left).then(function (summary) {
        summary.skipped = invoices.length - kept.length
        return summary
      })
    })
  }).catch(function (error) {
    return { sent: 0, skipped: 0, left: left, error: error.message || '发送失败' }
  })
}

/** 草稿数组 → 电脑端。返回 { sent, skipped, batch, left, error } */
function send(drafts) {
  const invoices = (drafts || []).map(draft.toInvoice).filter(function (invoice) {
    return !!invoice.number
  })
  if (!invoices.length) return Promise.resolve({ sent: 0, skipped: 0, batch: '', left: 0 })
  if (invoices.length <= MAX_SEND) return sendChecked(invoices, 0)

  return confirmLimit(invoices.length).then(function (go) {
    if (!go) return { sent: 0, skipped: 0, batch: '', left: 0, cancelled: true }
    return sendChecked(invoices.slice(0, MAX_SEND), invoices.length - MAX_SEND)
  })
}

module.exports = {
  MAX_SEND: MAX_SEND,
  send: send
}
