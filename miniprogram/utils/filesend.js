/**
 * 文件传输：把小程序里的原件上传到电脑端，并维护本地发送历史。
 *
 * 两个来源：
 *   1) 微信会话文件 —— chooseMessageFile 选完直接上传（原件）
 *   2) 台账已存原件 —— 从台账记录的 files[] 里取本地路径上传，不用重新选
 *
 * 发送历史存在本地 Storage，记录文件名/大小/时间/是否重复/是否失败，
 * 供"文件传输"页展示；电脑端权威列表通过 lanservice.listFiles() 拉取对账。
 */

const lanservice = require('./lanservice')
const store = require('./store')

const HISTORY_KEY = 'file_send_history'
const MAX_HISTORY = 100
const MAX_FILES = 20
const MAX_BYTES = 20 * 1024 * 1024

let WX = null
let LAN = null
let STORE = null

/** 测试注入用 */
function setEnv(opts) {
  if (opts.wx) WX = opts.wx
  if (opts.lanservice) LAN = opts.lanservice
  if (opts.store) STORE = opts.store
}

function wxApi() {
  if (!WX) WX = wx
  return WX
}

function lan() {
  if (!LAN) LAN = lanservice
  return LAN
}

function st() {
  if (!STORE) STORE = store
  return STORE
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

function history() {
  try {
    const list = wxApi().getStorageSync(HISTORY_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

function addHistory(entry) {
  const list = history()
  list.unshift(Object.assign({ at: Date.now() }, entry))
  const kept = list.slice(0, MAX_HISTORY)
  try { wxApi().setStorageSync(HISTORY_KEY, kept) } catch (e) {}
  return kept
}

function clearHistory() {
  try { wxApi().setStorageSync(HISTORY_KEY, []) } catch (e) {}
  return []
}

/** 展示用：给历史条目补上 humanSize / timeText / 状态文案 */
function displayHistory() {
  const labels = { ok: '已送达', duplicate: '已存在', fail: '失败' }
  return history().map(function (e) {
    return Object.assign({}, e, {
      humanSize: human(e.size),
      timeText: timeText(e.at),
      statusLabel: labels[e.status] || e.status
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

/** 台账里所有已存原件，按 digest+size 去重 */
function ledgerFiles() {
  const list = st().listInvoices()
  const seen = {}
  const out = []
  list.forEach(function (inv) {
    (inv.files || []).forEach(function (f) {
      if (!f.path) return
      const key = (f.digest || '') + ':' + (f.size || 0)
      if (seen[key]) return
      seen[key] = true
      out.push({
        path: f.path,
        name: f.name || 'invoice',
        size: f.size || 0,
        invoiceNo: inv.invoice_no || ''
      })
    })
  })
  return out
}

/** 来源二：把台账已存原件传到电脑端，不用重新选文件 */
function sendLedgerFiles() {
  const files = ledgerFiles()
  if (!files.length) return Promise.resolve({ total: 0, ok: 0, duplicate: 0, fail: 0 })
  return sendList(files, 'ledger')
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

module.exports = {
  setEnv: setEnv,
  human: human,
  timeText: timeText,
  history: history,
  displayHistory: displayHistory,
  clearHistory: clearHistory,
  chooseFiles: chooseFiles,
  sendOne: sendOne,
  sendList: sendList,
  sendFromChat: sendFromChat,
  ledgerFiles: ledgerFiles,
  sendLedgerFiles: sendLedgerFiles,
  remoteFiles: remoteFiles
}
