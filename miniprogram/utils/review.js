/** 待复核清单的展示逻辑：说清楚「为什么待复核」，不做真伪判断。 */

const store = require('./store')
const labels = require('./labels')

function reasons(inv) {
  const out = []
  if (!inv.invoice_no) out.push('缺发票号码')
  ;(inv.anomaly || []).forEach(function (text) { if (text) out.push(text) })
  if (!out.length) out.push('字段待人工确认')
  return out
}

function toCard(inv) {
  return {
    id: inv.id,
    title: inv.seller_name || '未填销方',
    no: inv.invoice_no || '无号码',
    date: inv.issue_date || '日期待补',
    amountText: store.yuan(inv.total_cent),
    sourceText: labels.sourceName(inv.source),
    importText: labels.importText(inv.created_at),
    categoryText: inv.category || '未分类',
    reasons: reasons(inv)
  }
}

function cards() {
  return store.reviewList().map(toCard)
}

module.exports = {
  reasons: reasons,
  toCard: toCard,
  cards: cards
}
