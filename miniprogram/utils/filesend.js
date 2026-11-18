/**
 * 文件传输：把原件上传到电脑端，并维护本地发送历史。
 *
 * 原件来源只有「微信会话文件」一条：台账不再存本机，也就没有「台账已存原件」可发。
 *
 * 发送历史存在本地 Storage，记录文件名/大小/时间/是否重复/是否失败，
 * 供「传输中心」页展示；电脑端权威列表通过 lanservice.listFiles() 拉取对账。
 */

const lanservice = require('./lanservice')

const HISTORY_KEY = 'file_send_history'
const MAX_HISTORY = 100
const MAX_FILES = 20
const MAX_BYTES = 20 * 1024 * 1024

// 发送记录与电脑端副本都只保留 30 天：传输记录是过程数据，久了没有查看价值，
// 发票原件该留在电脑的台账备份里，不该靠这里长期保存。
const RETENTION_DAYS = 30
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000

let seq = 0

let WX = null
let LAN = null

/** 测试注入用 */
function setEnv(opts) {
  if (opts.wx) WX = opts.wx
  if (opts.lanservice) LAN = opts.lanservice
}

function wxApi() {
  if (!WX) WX = wx
  return WX
}

function lan() {
  if (!LAN) LAN = lanservice
  return LAN
}

function human(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

function timeText(ts) {
  const d = new Date(Number(ts) || 0)
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

/** 电脑端返回的是 RFC3339（UTC），转成本地「MM-DD HH:mm」 */
function isoText(value) {
  const d = new Date(String(value || ''))
  if (isNaN(d.getTime())) return String(value || '')
  return timeText(d.getTime())
}

function history() {
  try {
    const list = wxApi().getStorageSync(HISTORY_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

function writeHistory(list) {
  try { wxApi().setStorageSync(HISTORY_KEY, list) } catch (e) {}
  return list
}

/** 早于保留期的记录不再有意义，页面打开时顺手丢掉 */
function isFresh(entry, now) {
  const at = Number(entry && entry.at) || 0
  return now - at <= RETENTION_MS
}

function purgeOldHistory() {
  const now = Date.now()
  const all = history()
  const kept = all.filter(function (entry) { return isFresh(entry, now) })
  const removed = all.length - kept.length
  if (removed > 0) writeHistory(kept)
  return removed
}

function addHistory(entry) {
  const list = history()
  seq += 1
  list.unshift(Object.assign({ id: 'f' + Date.now() + '-' + seq, at: Date.now() }, entry))
  return writeHistory(list.slice(0, MAX_HISTORY))
}

function removeHistory(ids) {
  const wanted = {}
  ;(ids || []).forEach(function (id) { if (id) wanted[id] = true })
  const all = history()
  const kept = all.filter(function (entry) { return !wanted[entry.id] })
  const removed = all.length - kept.length
  if (removed > 0) writeHistory(kept)
  return removed
}

function clearHistory() {
  return writeHistory([])
}

/** 展示用：补 id / humanSize / timeText / 状态与来源文案，只给保留期内的记录 */
function displayHistory() {
  const statusLabels = { ok: '已送达', duplicate: '已存在', fail: '失败' }
  const now = Date.now()
  return history().filter(function (entry) { return isFresh(entry, now) }).map(function (entry) {
    return Object.assign({}, entry, {
      humanSize: human(entry.size),
      timeText: timeText(entry.at),
      statusLabel: statusLabels[entry.status] || entry.status,
      sourceLabel: '会话文件'
    })
  })
}

function chooseFiles(count) {
  return new Promise(function (resolve) {
    wxApi().chooseMessageFile({
      count: count || MAX_FILES,
      type: 'all',
      success: function (res) { resolve({ files: res.tempFiles || [] }) },
      fail: function (err) {
        resolve({ error: '选择失败：' + ((err && err.errMsg) || '') + '（文件需先发到文件传输助手）' })
      }
    })
  })
}

/** 上传单个文件，无论成败都返回一条结果（不 reject），并写入历史 */
function sendOne(file, source) {
  const name = file.name || 'invoice'
  const size = Number(file.size) || 0
  if (size > MAX_BYTES) {
    const bad = { name: name, size: size, status: 'fail', source: source, message: '超过 20MB 限制' }
    addHistory(bad)
    return Promise.resolve(bad)
  }

  return lan().uploadFile(file.path, name, source).then(function (res) {
    const entry = {
      name: (res && res.name) || name,
      size: (res && typeof res.size === 'number') ? res.size : size,
      status: (res && res.duplicate) ? 'duplicate' : 'ok',
      sha256: ((res && res.sha256) || '').slice(0, 12),
      source: (res && res.source) || source,
      message: (res && res.duplicate) ? '电脑端已存在相同文件' : '已送达电脑端'
    }
    addHistory(entry)
    return entry
  }).catch(function (error) {
    const entry = {
      name: name, size: size, status: 'fail', source: source,
      message: (error && error.message) || '上传失败'
    }
    addHistory(entry)
    return entry
  })
}

/** 顺序上传一批，汇总成功/重复/失败数量 */
function sendList(files, source) {
  const list = (files || []).filter(function (f) { return f && f.path })
  const summary = { total: list.length, ok: 0, duplicate: 0, fail: 0, results: [] }
  if (!list.length) return Promise.resolve(summary)

  return list.reduce(function (chain, file) {
    return chain.then(function (acc) {
      return sendOne(file, source).then(function (entry) {
        acc[entry.status] = (acc[entry.status] || 0) + 1
        acc.results.push(entry)
        return acc
      })
    })
  }, Promise.resolve(summary))
}

/** 来源一：从微信会话选文件并上传原件 */
function sendFromChat() {
  return chooseFiles(MAX_FILES).then(function (r) {
    if (r.error) return { error: r.error }
    if (!r.files.length) return { error: '没有选到文件' }
    const files = r.files.map(function (f) {
      return {
        path: f.path || f.tempFilePath,
        name: String(f.name || 'invoice').split('/').pop(),
        size: f.size || 0
      }
    })
    return sendList(files, 'miniprogram')
  })
}

/** 电脑端权威文件列表，用于页面对账展示 */
function remoteFiles() {
  return lan().listFiles().then(function (data) {
    return {
      incoming: (data && data.incoming) || [],
      outgoing: (data && data.outgoing) || []
    }
  })
}

/** 电脑端已收文件 → 展示结构（带大小与本地时间文本） */
function remoteList() {
  return remoteFiles().then(function (data) {
    return data.incoming.map(function (file) {
      return Object.assign({}, file, {
        humanSize: human(file.size),
        timeText: isoText(file.uploaded_at)
      })
    })
  })
}

module.exports = {
  setEnv: setEnv,
  human: human,
  timeText: timeText,
  isoText: isoText,
  RETENTION_DAYS: RETENTION_DAYS,
  history: history,
  displayHistory: displayHistory,
  purgeOldHistory: purgeOldHistory,
  removeHistory: removeHistory,
  clearHistory: clearHistory,
  chooseFiles: chooseFiles,
  sendOne: sendOne,
  sendList: sendList,
  sendFromChat: sendFromChat,
  remoteFiles: remoteFiles,
  remoteList: remoteList
}
