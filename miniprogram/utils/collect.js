/**
 * 收票入口：扫码 / 从会话选文件。
 *
 * 两个函数都返回 Promise<{ ok, draft, message }>，不抛异常，
 * 页面只负责展示 message 和跳转，不写业务逻辑。
 *
 * 这里不保存任何东西：解析出来的草稿交给页面放进内存，发送成功后即丢。
 */

const einvoice = require('./einvoice')
const draft = require('./draft')

const FS = wx.getFileSystemManager()

function extOf(name) {
  const s = String(name || '')
  const i = s.lastIndexOf('.')
  return i < 0 ? '' : s.slice(i + 1).toLowerCase()
}

function fail(message) {
  return { ok: false, message: message }
}

function success(item, message) {
  return { ok: true, draft: item, message: message }
}

/** S2/S3：扫二维码 → 明文串草稿 */
function scanDraft() {
  return new Promise(function (resolve) {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: function (res) {
        const raw = res.result || ''
        const kind = einvoice.classifyQr(raw)
        if (kind === 'legacy-csv') {
          const qr = einvoice.parseLegacyQr(raw)
          const made = draft.fromQr(qr, { raw: raw })
          resolve(made ? success(made, '扫码草稿已生成') : fail('二维码字段不足，请改用文件导入'))
          return
        }
        if (kind === 'url') {
          resolve(fail('链接型二维码暂不自动解析，请用文件导入'))
          return
        }
        resolve(fail('无法识别的二维码内容'))
      },
      fail: function (err) { resolve(fail('扫码失败：' + (err.errMsg || ''))) }
    })
  })
}

function readText(path) {
  try {
    return FS.readFileSync(path, 'utf8')
  } catch (e) {
    return null
  }
}

function xmlDraft(file) {
  const text = readText(file.path)
  if (!text) return fail('读取 XML 失败')
  const parsed = einvoice.extractInvoice(text)
  if (!parsed.ok) return fail('XML 结构不符合数电票格式')
  const made = draft.fromParsed(parsed, { source: 'xml' })
  if (!made) return fail('转换草稿失败')
  made.hint = '已按 XML 自动填全字段，发送后到电脑端补报销人。'
  return success(made, '已解析 XML，字段已自动填入')
}

/** 单个文件 → XML 解析或版式文件留空。chooseMessageFile 的字段名两种都有 */
function oneFile(f) {
  const ext = extOf(f.name)
  if (['xml', 'ofd', 'pdf'].indexOf(ext) < 0) {
    return Promise.resolve(fail('暂支持 .xml / .ofd / .pdf，收到的是 .' + ext))
  }
  if (ext === 'xml') return Promise.resolve(xmlDraft({ path: f.path || f.tempFilePath }))
  return Promise.resolve(success(draft.fromLayout(ext), '版式文件，字段需在电脑端补录'))
}

function chooseFiles(count) {
  return new Promise(function (resolve) {
    wx.chooseMessageFile({
      count: count,
      type: 'all',
      success: function (res) { resolve(res.tempFiles || []) },
      fail: function (err) {
        resolve({ error: '选择失败：' + (err.errMsg || '') + '（文件需先发到文件传输助手）' })
      }
    })
  })
}

/** 批量导入：一次最多 20 个文件，逐个解析，单文件失败不影响其他 */
function fileDrafts() {
  return chooseFiles(20).then(function (chosen) {
    if (chosen.error) return fail(chosen.error)
    if (!chosen.length) return fail('没有选到文件')
    return Promise.all(chosen.map(oneFile)).then(function (results) {
      return { ok: true, results: results }
    })
  })
}

function fileDraft() {
  return chooseFiles(1).then(function (chosen) {
    if (chosen.error) return fail(chosen.error)
    if (!chosen.length) return fail('没有选到文件')
    return oneFile(chosen[0])
  })
}

function confirm(title, content) {
  return new Promise(function (resolve) {
    wx.showModal({
      title: title,
      content: content,
      confirmText: '继续',
      success: function (r) { resolve(!!r.confirm) },
      fail: function () { resolve(false) }
    })
  })
}

/** 连续扫码：每扫一张问一次是否继续，返回内存里的草稿数组 */
function scanDrafts() {
  const drafts = []
  function step() {
    return scanDraft().then(function (r) {
      if (r.ok) drafts.push(r.draft)
      return confirm('继续扫码？', r.ok ? '已收集 ' + drafts.length + ' 张' : r.message)
    }).then(function (go) {
      return go ? step() : { ok: true, drafts: drafts }
    })
  }
  return step()
}

module.exports = {
  scanDraft: scanDraft,
  scanDrafts: scanDrafts,
  fileDraft: fileDraft,
  fileDrafts: fileDrafts,
  extOf: extOf
}
