/** 统计页的聚合逻辑。输入是 store.listInvoices() 的结果，不碰文件系统。 */

const labels = require('./labels')

function tally(list, pick) {
  const map = {}
  ;(list || []).forEach(function (inv) {
    const name = pick(inv) || '未分类'
    if (!map[name]) map[name] = { name: name, count: 0, cent: 0 }
    map[name].count++
    map[name].cent += Number(inv.total_cent) || 0
  })
  return Object.keys(map).map(function (name) { return map[name] }).sort(function (a, b) { return b.cent - a.cent })
}

function decorate(rows, totalCent) {
  const total = Number(totalCent) || 0
  return rows.map(function (row) {
    return {
      name: row.name,
      count: row.count,
      amountText: (row.cent / 100).toFixed(2),
      percent: total ? Math.round(row.cent * 100 / total) : 0
    }
  })
}

function summary(list) {
  return (list || []).reduce(function (s, inv) {
    s.count++
    s.totalCent += Number(inv.total_cent) || 0
    s.taxCent += Number(inv.tax_cent) || 0
    return s
  }, { count: 0, totalCent: 0, taxCent: 0 })
}

function byCategory(list) {
  return decorate(tally(list, function (inv) { return inv.category || '未分类' }), summary(list).totalCent)
}

function bySource(list) {
  return decorate(tally(list, function (inv) { return labels.sourceName(inv.source) }), summary(list).totalCent)
}

module.exports = {
  summary: summary,
  byCategory: byCategory,
  bySource: bySource
}
