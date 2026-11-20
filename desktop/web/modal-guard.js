/**
 * 弹窗关闭保护：填过内容时误点遮罩或按 Esc，不该直接把内容抹掉。
 *
 * 用「打开时的字段快照」判断是否改过，而不是监听 input 计数：
 * 粘贴整行是直接改 value，不触发 input；改了又改回原样也不该再拦。
 */

/** 拍下当前字段值，作为「没改过」的基准 */
function captureFields(fields) {
  return fields.map((pair) => ($(pair[1]).value || '').trim())
}

/** 字段值是否偏离快照；没有快照视为没改过 */
function fieldsDirty(snapshot, fields) {
  if (!snapshot) return false
  return captureFields(fields).some((value, i) => value !== snapshot[i])
}

/** 没改直接关；改过要用户明确放弃。返回 true 表示允许关闭 */
function allowDiscard(dirty, message) {
  return !dirty || confirm(message)
}
