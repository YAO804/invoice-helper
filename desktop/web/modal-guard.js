/**
 * 弹窗关闭保护 + 页面内确认框。
 *
 * 用「打开时的字段快照」判断是否改过，而不是监听 input 计数：
 * 粘贴整行是直接改 value，不触发 input；改了又改回原样也不该再拦。
 * 原生 confirm 的样式跟页面割裂，确认框复用同一套 modal。
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

let discardResolve = null
let discardPromise = null

/** 打开确认框；重复调用返回同一个 Promise，避免连点开出两层 */
function openConfirm(message) {
  if (discardPromise) return discardPromise
  $('confirmMessage').textContent = message
  $('confirmModal').hidden = false
  $('confirmKeepBtn').focus()
  discardPromise = new Promise((resolve) => { discardResolve = resolve })
  return discardPromise
}

/** discard=true 放弃内容继续关窗；false 继续填写 */
function answerConfirm(discard) {
  if (!discardResolve) return
  const resolve = discardResolve
  discardResolve = null
  discardPromise = null
  $('confirmModal').hidden = true
  resolve(discard)
}

/** 没改直接关；改过弹页面内确认框，返回 Promise<boolean> */
function allowDiscard(dirty, message) {
  return dirty ? openConfirm(message) : Promise.resolve(true)
}
