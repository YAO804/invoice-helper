/** 展示用的通用格式化：文件大小与时间文本。发文件、取文件两侧共用，避免各写一份。 */

function human(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 时间戳 → 「MM-DD HH:mm」 */
function timeText(ts) {
  const d = new Date(Number(ts) || 0)
  return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 电脑端返回的是 RFC3339（UTC），转成本地「MM-DD HH:mm」 */
function isoText(value) {
  const d = new Date(String(value || ''))
  if (isNaN(d.getTime())) return String(value || '')
  return timeText(d.getTime())
}

module.exports = {
  human: human,
  timeText: timeText,
  isoText: isoText
}
