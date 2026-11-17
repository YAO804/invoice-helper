const lanservice = require('./lanservice')
const store = require('./store')

function money(cents) {
  const value = Number(cents) || 0
  return value > 0 ? store.yuan(value) : ''
}

function toInvoice(draft) {
  return {
    number: draft.invoice_no || '',
    code: draft.invoice_code || '',
    kind: draft.invoice_type || '',
    issue_date: draft.issue_date || '',
    seller_name: draft.seller_name || '',
    seller_tax_id: draft.seller_tax_id || '',
    buyer_name: draft.buyer_name || '',
    buyer_tax_id: draft.buyer_tax_id || '',
    amount: money(draft.amount_excl_tax_cent),
    tax: money(draft.tax_cent),
    total: money(draft.total_cent),
    tax_rate: draft.tax_rate || '',
    batch: '',
    created_at: ''
  }
}

function matchText(match) {
  if (!match.seller_name) return '电脑台账已有'
  return match.seller_name + ' / ' + (match.total || '-') + ' / ' + (match.issue_date || '-')
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

function postList(list) {
  return lanservice.sendInvoices(list).then(function (result) {
    return {
      sent: result.added || 0,
      skipped: 0,
      batch: result.batch || ''
    }
  })
}

function send(drafts) {
  const invoices = (drafts || []).map(toInvoice).filter(function (invoice) {
    return !!invoice.number
  })
  if (!invoices.length) return Promise.resolve({ sent: 0, skipped: 0, batch: '' })

  return lanservice.checkInvoiceNumbers(invoices.map(function (invoice) {
    return invoice.number
  })).then(function (result) {
    const matches = result.matches || {}
    if (!Object.keys(matches).length) return postList(invoices)

    return confirmDuplicates(matches).then(function (keepAll) {
      if (keepAll) return postList(invoices)
      const kept = invoices.filter(function (invoice) {
        return !matches[invoice.number]
      })
      if (!kept.length) {
        return { sent: 0, skipped: invoices.length, batch: '' }
      }
      return postList(kept).then(function (summary) {
        summary.skipped = invoices.length - kept.length
        return summary
      })
    })
  }).catch(function (error) {
    return { sent: 0, skipped: 0, error: error.message || '发送失败' }
  })
}

module.exports = {
  toInvoice: toInvoice,
  send: send
}
