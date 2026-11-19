/**
 * 电脑端所有时间的统一出口：一律按北京时间（UTC+8）展示。
 *
 * 后端把上传时间、待取文件修改时间、事件时间都按 RFC3339 UTC 存
 * （"2026-11-19T00:21:00Z"），直接贴到界面上就是那串带 Z 的机器串。
 * 中国没有夏令时，固定 +8 小时即可；刻意不用 toLocaleString，
 * 因为它跟随电脑的系统时区，机器时区设错时界面跟着错。
 */

const BEIJING_OFFSET = 8 * 60 * 60 * 1000

function beijingPad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 带时区标记（Z 或 ±hh:mm）才需要换算，裸文本已经是人写好的时间 */
function hasZoneMark(text) {
  return /(Z|[+-]\d{2}:?\d{2})$/.test(text)
}

function beijingFormat(date) {
  const d = new Date(date.getTime() + BEIJING_OFFSET)
  return d.getUTCFullYear() + '-' + beijingPad(d.getUTCMonth() + 1) + '-' + beijingPad(d.getUTCDate()) +
    ' ' + beijingPad(d.getUTCHours()) + ':' + beijingPad(d.getUTCMinutes()) + ':' + beijingPad(d.getUTCSeconds())
}

/**
 * RFC3339（UTC 或带偏移）→ 北京时间 "2026-11-19 08:21:00"。
 * 时间戳、纯本地文本（台账 created_at 那种）、空值、无法解析的串都能安全传进来。
 */
function beijingTime(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'number') return beijingFormat(new Date(value))

  const text = String(value).trim()
  if (!text) return ''
  if (!hasZoneMark(text)) return text

  const at = new Date(text)
  if (isNaN(at.getTime())) return text
  return beijingFormat(at)
}

/** 只取时分秒：给「更新于 08:11:30」这类标注用，不传参就是现在 */
function beijingClock(value) {
  const full = beijingTime(value === undefined ? Date.now() : value)
  return full.slice(11)
}
