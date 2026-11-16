/**
 * CSV 拼装：UTF-8 BOM + CRLF，Excel 直接打开不乱码。
 * 不引第三方库，只处理发票台账这种纯文本字段。
 */

function cell(v) {
  const s = (v === null || v === undefined) ? '' : String(v)
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function row(cells) {
  return cells.map(cell).join(',')
}

/** headers: string[], rows: any[][] */
function build(headers, rows) {
  const lines = [row(headers)]
  rows.forEach(function (r) { lines.push(row(r)) })
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

module.exports = {
  cell: cell,
  row: row,
  build: build
}
