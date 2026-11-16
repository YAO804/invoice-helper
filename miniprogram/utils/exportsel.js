/** 导出页的范围与内容选择。纯逻辑，不碰 wx API，方便单测。 */

const store = require('./store')
const batchmark = require('./batchmark')

const SCOPES = [
  { value: 'batch', name: '本次扫码' },
  { value: 'all', name: '全部' },
  { value: 'month', name: '指定月份' },
  { value: 'custom', name: '自定义勾选' }
]

const CONTENTS = [
  { key: 'ledger', name: '台账 CSV' },
  { key: 'manifest', name: '原件清单 CSV' },
  { key: 'files', name: '原件文件' }
]

function defaultScope() {
  return batchmark.current() ? 'batch' : 'all'
}

function resolve(scope, opts) {
  opts = opts || {}
  const basis = opts.basis || store.getBasis()
  if (scope === 'batch') {
    const id = batchmark.current()
    return id ? store.listInvoices({ batchId: id, sortBy: basis }) : []
  }
  if (scope === 'month' && opts.month) {
    return store.listInvoices({ month: opts.month, monthBasis: basis, sortBy: basis })
  }
  if (scope === 'custom') {
    const ids = (opts.ids || []).map(Number)
    return store.listInvoices({ sortBy: basis }).filter(function (inv) {
      return ids.indexOf(Number(inv.id)) >= 0
    })
  }
  return store.listInvoices({ sortBy: basis })
}

function toCards(list, selectedIds) {
  const ids = (selectedIds || []).map(Number)
  return (list || []).map(function (inv) {
    return {
      id: inv.id,
      title: inv.seller_name || '未填销方',
      no: inv.invoice_no || '无号码',
      amountText: store.yuan(inv.total_cent),
      checked: ids.indexOf(Number(inv.id)) >= 0
    }
  })
}

module.exports = {
  SCOPES: SCOPES,
  CONTENTS: CONTENTS,
  defaultScope: defaultScope,
  resolve: resolve,
  toCards: toCards
}
