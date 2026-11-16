/**
 * 台账清理：按勾选 id 或导入时间区间删除记录。
 * 只删台账记录，不碰原件文件——与详情页删除口径一致。
 */

const store = require('./store')
const labels = require('./labels')

function dayStart(dateStr) {
  const parts = String(dateStr || '').split('-')
  if (parts.length !== 3) return null
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function dayEnd(dateStr) {
  const start = dayStart(dateStr)
  return start === null ? null : start + 86400000 - 1
}

/** 按导入时间区间筛选，含首尾两天 */
function inRange(fromDate, toDate) {
  const from = dayStart(fromDate)
  const to = dayEnd(toDate)
  if (from === null || to === null || from > to) return []
  return store.listInvoices({ sortBy: 'created' }).filter(function (inv) {
    const t = Number(inv.created_at) || 0
    return t >= from && t <= to
  })
}

function removeIds(ids) {
  let deleted = 0
  ;(ids || []).forEach(function (id) {
    if (store.deleteInvoice(id)) deleted++
  })
  return { deleted: deleted }
}

function totalText(list) {
  const cent = list.reduce(function (s, inv) { return s + (Number(inv.total_cent) || 0) }, 0)
  return store.yuan(cent)
}

function cards(list, selectedIds) {
  const selected = (selectedIds || []).map(Number)
  return (list || []).map(function (inv) {
    return {
      id: inv.id,
      title: inv.seller_name || '未填销方',
      no: inv.invoice_no || '无号码',
      amountText: store.yuan(inv.total_cent),
      importText: labels.importText(inv.created_at),
      checked: selected.indexOf(Number(inv.id)) >= 0
    }
  })
}

module.exports = {
  dayStart: dayStart,
  dayEnd: dayEnd,
  inRange: inRange,
  removeIds: removeIds,
  totalText: totalText,
  cards: cards
}
