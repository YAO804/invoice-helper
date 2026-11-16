/** 台账里的枚举值 → 页面文案。页面只负责展示，不各自维护映射表。 */

const SHORT = { xml: 'XML', ofd: 'OFD', pdf: 'PDF', qr: '扫码', manual: '手录' }
const LONG = {
  xml: 'XML 原件',
  ofd: 'OFD 原件',
  pdf: 'PDF 原件',
  qr: '扫码草稿',
  manual: '手动录入'
}

function sourceName(src, long) {
  return (long ? LONG : SHORT)[src] || '其他'
}

function importText(ms) {
  if (ms === null || ms === undefined || ms === '') return '导入时间未知'
  const d = new Date(Number(ms))
  if (isNaN(d.getTime())) return '导入时间未知'
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return '导入 ' + (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

module.exports = {
  sourceName: sourceName,
  importText: importText
}
