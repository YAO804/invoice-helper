/**
 * 收票入口：扫码 / 从会话选文件
 *
 * 两个函数都返回 Promise<{ ok, draft, message }>，不抛异常，
 * 页面只负责展示 message 和跳转，不写业务逻辑。
 */

const einvoice = require('./einvoice')
const store = require('./store')
const archive = require('./archive')

const FS = wx.getFileSystemManager()

function extOf(name) {
  const s = String(name || '')
  const i = s.lastIndexOf('.')
  return i < 0 ? '' : s.slice(i + 1).toLowerCase()
}

function fail(message) {
  return { ok: false, message: message }
}

function success(draft, message) {
  return { ok: true, draft: draft, message: message }
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
          const draft = store.fromQr(qr, { raw: raw })
          resolve(draft ? success(draft, '扫码草稿已生成') : fail('二维码字段不足，请手动录入'))
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

function readXml(path) {
  try {
    return FS.readFileSync(path, 'utf8')
  } catch (e) {
    return null
  }
}

function xmlDraft(file, saved) {
  const text = readXml(saved.path)
  if (!text) return fail('读取 XML 失败')
  const parsed = einvoice.extractInvoice(text)
  if (!parsed.ok) return fail('XML 结构不符合数电票格式')
  const draft = store.fromParsed(parsed, { source: 'xml', files: [saved] })
  if (!draft) return fail('转换台账记录失败')
  draft.hint = '已按 XML 自动填全字段，核对后保存即可。'
  return success(draft, '已解析 XML，字段已自动填入')
}

function layoutDraft(file, saved, ext) {
  const draft = {
    invoice_no: '',
    invoice_code: '',
    invoice_type: '数电票',
    issue_date: '',
    seller_name: '',
    seller_tax_id: '',
    buyer_name: '',
    total_cent: 0,
    amount_excl_tax_cent: 0,
    tax_cent: 0,
    source: ext,
    confidence: 0.5,
    files: [saved],
    items: [],
    note: '',
    hint: ext === 'ofd'
      ? 'OFD 原件已存档。版式文件内部文本是压缩的，端侧暂不解压，字段请补录。'
      : 'PDF 原件已存档。端侧不解析 PDF，字段请补录。'
  }
  draft.anomaly = store.validate(draft)
  return success(draft, '原件已存档，请补录字段')
}

/** 单个文件 → 原件存档 → XML 解析或版式文件留档 */
function oneFile(f) {
  const ext = extOf(f.name)
  if (['xml', 'ofd', 'pdf'].indexOf(ext) < 0) {
    return Promise.resolve(fail('暂支持 .xml / .ofd / .pdf，收到的是 .' + ext))
  }
  return archive.save(f.path || f.tempFilePath, f.name, f.size).then(function (saved) {
    return ext === 'xml' ? xmlDraft(f, saved) : layoutDraft(f, saved, ext)
  }).catch(function (e) {
    return fail('存档失败：' + (e.message || e))
  })
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

/** 批量导入：一次最多 20 个文件，逐个存档解析，单文件失败不影响其他 */
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

/** 连续扫码：每扫一张问一次是否继续，返回草稿数组 */
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
