/** 记住最后一次批量扫码的标记。只存一个 id，不占 Storage 配额。 */

const KEY = 'last_scan_batch_id'

function current() {
  try { return wx.getStorageSync(KEY) || '' } catch (e) { return '' }
}

function set(id) {
  try { wx.setStorageSync(KEY, id) } catch (e) {}
  return current()
}

function clear() {
  try { wx.setStorageSync(KEY, '') } catch (e) {}
}

module.exports = {
  current: current,
  set: set,
  clear: clear
}
