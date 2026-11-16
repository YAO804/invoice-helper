/**
 * 批量落库：把导入得到的草稿一次性写入台账。
 * 重复票不静默覆盖：只有来源更可靠时才合并补全（扫码草稿 → XML 原件）。
 * 无号码的版式文件草稿天然可能撞键，不参与去重。
 */

const store = require('./store')

const SOURCE_RANK = { qr: 1, pdf: 2, manual: 2, ofd: 3, xml: 4 }

function rank(draft) {
  return SOURCE_RANK[draft.source || ''] || 0
}

function mergeFiles(a, b) {
  const out = []
  const seen = {}
  ;(a || []).concat(b || []).forEach(function (f) {
    if (f && f.path && !seen[f.path]) { seen[f.path] = 1; out.push(f) }
  })
  return out
}

/** 只有更可靠的来源才能补全已有记录；保留原 id 与首次导入时间 */
function mergeBetter(existing, incoming) {
  if (!existing || !incoming || rank(incoming) <= rank(existing)) return null
  const merged = Object.assign({}, existing, incoming)
  merged.id = existing.id
  merged.created_at = existing.created_at
  merged.updated_at = Date.now()
  merged.files = mergeFiles(existing.files, incoming.files)
  merged.anomaly = incoming.anomaly || existing.anomaly || []
  merged.note = incoming.note || existing.note || ''
  return merged
}

function saveAll(drafts) {
  const report = { saved: 0, upgraded: 0, duplicate: 0, incomplete: 0, failed: 0, ids: [] }
  ;(drafts || []).forEach(function (draft) {
    if (!draft) { report.failed++; return }

    if (draft.invoice_no) {
      const dup = store.findDuplicate(draft)
      if (dup) {
        const merged = mergeBetter(dup, draft)
        if (!merged) { report.duplicate++; return }
        const saved = store.upsertInvoice(merged)
        report.upgraded++
        report.ids.push(saved.id)
        return
      }
    }

    try {
      const saved = store.upsertInvoice(draft)
      report.saved++
      report.ids.push(saved.id)
      if (!saved.invoice_no) report.incomplete++
    } catch (e) {
      report.failed++
    }
  })
  return report
}

function describe(report) {
  const parts = []
  if (report.saved) parts.push('新入库 ' + report.saved + ' 张')
  if (report.upgraded) parts.push('补全升级 ' + report.upgraded + ' 张')
  if (report.incomplete) parts.push('待补录 ' + report.incomplete + ' 张')
  if (report.duplicate) parts.push('重复跳过 ' + report.duplicate + ' 张')
  if (report.failed) parts.push('失败 ' + report.failed + ' 张')
  return parts.length ? parts.join('，') : '没有可导入的记录'
}

module.exports = {
  rank: rank,
  mergeBetter: mergeBetter,
  saveAll: saveAll,
  describe: describe
}
