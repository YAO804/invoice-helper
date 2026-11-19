/**
 * Excel 粘贴数据的解析与转换。
 *
 * 从 Excel 复制表格区域得到的是 TSV（制表符分隔、换行分行），第一行是表头。
 * 这里把它转成 CSV 文本，构造 File 后复用 /api/invoices/import 的预览与
 * 判重链路——后端不需要为粘贴单独开接口，口径也不会出现第二套。
 */

/** 把一行 TSV 拆成单元格数组，保留空单元格（末尾空列要一起保留）。 */
function splitTSVLine(line) {
  const cells = line.replace(/\r$/, '').split('\t')
  while (cells.length && cells[cells.length - 1].trim() === '') cells.pop()
  return cells
}

/** CSV 字段转义：含逗号/引号/换行的字段要加引号，内部引号翻倍。 */
function csvCell(value) {
  const text = String(value ?? '').trim()
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

/**
 * TSV 文本转 CSV 文本。
 * 空行跳过；表头原样保留（后端按表头名映射，列名不对会明确报错）。
 */
function tsvToCSV(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.map((line) => splitTSVLine(line).map(csvCell).join(',')).join('\n')
}

/** 粘贴内容至少要有一行表头 + 一行数据，否则给出可操作的提示。 */
function pasteImportError(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim() !== '')
  if (!lines.length) return '请先从 Excel 复制表格内容并粘贴'
  if (lines.length < 2) return '只有表头没有数据行，请连同要导入的发票一起复制'
  const header = splitTSVLine(lines[0])
  if (header.indexOf('发票号码') < 0) return '表头里没有「发票号码」，请使用下载的模板或补上这一列'
  return ''
}
