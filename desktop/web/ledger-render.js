/** 录入时间是 "2026-11-18 09:10:18"，卡片上只显示日期——它同时是「只看这一天」的筛选值 */
function latestDateText(value) {
  const text = String(value || '').trim()
  const cut = text.indexOf(' ')
  return cut > 0 ? text.slice(0, cut) : text
}

function renderInvoiceStats(data) {
  $('invTotal').textContent = data.total || 0
  $('invDuplicates').textContent = data.duplicate_groups || 0
  $('invNeedFill').textContent = data.need_fill || 0
  // 用后端给的全表最新录入时间，不看当前列表第一行：
  // 这张卡片同时是筛选入口，值必须稳定，不能跟着筛选结果漂
  $('invLatestDate').textContent = latestDateText(data.latest_created_at) || '—'
  $('lastInvoiceRefresh').textContent = '更新于 ' + beijingClock()
}

/**
 * 分页条。只有一页时整条隐藏——20 条以内还给用户看「1 / 1」是噪音。
 * total 用的是后端给的筛选后总数，不是当前页条数，否则页脚会写成「共 20 张」。
 */
function renderInvoicePager(data) {
  const box = $('invoicePager')
  if (!box) return

  const count = Math.max(1, data.page_count || 1)
  const page = Math.min(Math.max(1, data.page || 1), count)
  box.hidden = count <= 1

  $('pagerSummary').textContent = '共 ' + (data.total || 0) + ' 张 · 每页 ' + (data.page_size || 0) + ' 张'
  $('pagerPosition').textContent = page + ' / ' + count

  // 到头了就别让按钮看起来还能点
  const atStart = page <= 1
  const atEnd = page >= count
  $('pagerFirst').disabled = atStart
  $('pagerPrev').disabled = atStart
  $('pagerNext').disabled = atEnd
  $('pagerLast').disabled = atEnd
}

/**
 * 台账金额是字符串（"287.61"），求和必须换算成分。
 * 直接累加浮点，几十张之后就会出现 2982.3399999999997 这种尾巴。
 * 顺手去掉千分位逗号：CSV 导入的数据里可能有 "1,234.56"。
 */
function toCents(value) {
  const text = String(value || '').trim().replace(/,/g, '')
  if (!text) return 0
  const num = Number(text)
  return isFinite(num) ? Math.round(num * 100) : 0
}

/** 千分位分组。不用 toLocaleString，免得不同环境的 locale 数据让显示不一致 */
function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function money(cents) {
  const abs = Math.abs(cents)
  const yuan = String(Math.floor(abs / 100))
  const fen = String(abs % 100).padStart(2, '0')
  return (cents < 0 ? '-' : '') + '¥' + groupThousands(yuan) + '.' + fen
}

/**
 * 选中汇总：张数 + 合计金额。
 * 金额为空的行不计入（按 0 算会让合计悄悄偏小），但要单独提示张数，
 * 否则用户会以为合计就是选中的全部。
 */
function renderSelectionSummary(items, selected) {
  const picked = (items || []).filter((item) => selected.has(item.id))
  $('invoiceSelectedCount').textContent = '已选 ' + picked.length + ' 张'

  const box = $('invoiceSelectedTotal')
  if (!picked.length) {
    box.hidden = true
    box.textContent = ''
    return
  }

  const cents = picked.reduce((sum, item) => sum + toCents(item.total), 0)
  const missing = picked.filter((item) => !String(item.total || '').trim()).length
  box.hidden = false
  box.textContent = '合计 ' + money(cents) + (missing ? '（' + missing + ' 张无金额）' : '')
}

function renderDuplicateAlert(groups) {
  const box = $('duplicateAlert')
  if (!groups || !groups.length) {
    box.innerHTML = '<div class="alert ok">未发现重复发票</div>'
    return
  }

  const count = groups.reduce((sum, group) => sum + group.items.length, 0)
  box.innerHTML = `
    <div class="alert">
      <span>发现 ${groups.length} 组重复发票，共 ${count} 张。请核对后自行删除。</span>
      <button id="openDuplicateDrawerBtn" type="button" class="secondary">查看重复组</button>
    </div>
  `
}

const COPY_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.78.78 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h7.5c.14 0 .25-.11.25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5ZM5 1.75C5 .78 5.78 0 6.75 0h7.5c.97 0 1.75.78 1.75 1.75v7.5c0 .97-.78 1.75-1.75 1.75h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h7.5c.14 0 .25-.11.25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5Z"/></svg>'

/**
 * 号码/代码做成可复制按钮。
 * 文字必须单独包一层 span 才能省略——直接给 inline-flex 的按钮加 text-overflow 不生效。
 */
function copyCell(value) {
  const text = value || ''
  const hint = text ? '点击复制 ' + text : '点击复制'
  return `<button type="button" class="copy-cell" data-copy="${esc(text)}" title="${esc(hint)}"><span class="copy-text">${esc(text)}</span>${COPY_ICON}</button>`
}

/** 录入时间拆两行（日期在上、时间在下）：宽度几乎减半，信息一点没少 */
function createdCell(value) {
  // 后端目前存的是本地文本，beijingTime 对这类输入原样返回；
  // 万一哪天改成 RFC3339，这里也不用再改
  const text = String(beijingTime(value) || '')
  const cut = text.indexOf(' ')
  if (cut < 0) return `<td class="col-created">${esc(text)}</td>`
  return `<td class="col-created" title="${esc(text)}">${esc(text.slice(0, cut))}` +
    `<div class="muted tiny">${esc(text.slice(cut + 1))}</div></td>`
}

/** 报销人可点击直接编辑，无需打开补录弹窗；已填值时多给一个复制按钮，方便沿用到别的票 */
function reimburserCell(item) {
  const value = item.reimburser || ''
  const label = value ? esc(value) : '<span class="muted">待补录</span>'
  // 待补录没内容可复制，按钮只会挤占姓名位置；点它走 copy-cell 委托，不会进入编辑
  const copy = value
    ? `<button type="button" class="copy-cell reimburser-copy" data-copy="${esc(value)}" title="复制报销人 ${esc(value)}">${COPY_ICON}</button>`
    : ''
  return `<td class="reimburser-cell" data-action="edit-reimburser" data-id="${item.id}"
    tabindex="0" role="button" title="点击填写报销人">
    <span class="inline-value">${label}</span>${copy}
    <svg class="inline-pencil" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L3.464 11.1a.25.25 0 0 0-.064.108l-.497 1.74 1.74-.497a.25.25 0 0 0 .108-.064l8.612-8.612a.25.25 0 0 0 0-.354l-1.086-1.086Z"/></svg>
  </td>`
}

function renderInvoiceTable(items, selected) {
  const body = $('invoiceBody')
  if (!items || !items.length) {
    body.innerHTML = emptyRow('没有匹配的发票', 9)
    return
  }

  body.innerHTML = items.map((item) => {
    const badges = (item.duplicate ? '<span class="badge dup">重复</span>' : '') +
      (item.need_fill ? '<span class="badge fill">待补录</span>' : '')

    return `
    <tr class="${item.duplicate ? 'duplicate' : ''}">
      <td class="col-check"><input type="checkbox" class="invoice-check" data-id="${item.id}" ${selected.has(item.id) ? 'checked' : ''} aria-label="选择发票 ${esc(item.number)}"></td>
      <td class="col-number">${copyCell(item.number)}${badges ? `<div class="cell-badges">${badges}</div>` : ''}</td>
      <td class="col-code">${copyCell(item.code)}</td>
      <td class="col-kind" title="${esc(item.kind)}">${esc(item.kind)}</td>
      <td class="col-issued">${esc(item.issue_date)}</td>
      <td class="col-total num" title="${esc(item.total)}">${esc(item.total)}</td>
      ${reimburserCell(item)}
      ${createdCell(item.created_at)}
      <td class="col-actions">
        <button type="button" class="link" data-action="edit-invoice" data-id="${item.id}">补录</button>
        <button type="button" class="link danger" data-action="delete-invoice" data-id="${item.id}">删除</button>
      </td>
    </tr>
  `
  }).join('')
}

function renderDuplicatePanel(groups) {
  if (!groups || !groups.length) {
    $('duplicateBody').innerHTML = '<p class="empty">没有重复发票</p>'
    return
  }

  $('duplicateBody').innerHTML = groups.map((group) => `
    <div class="duplicate-group">
      <h3>${group.code ? '发票代码 ' + esc(group.code) + ' · ' : ''}发票号码 ${esc(group.number)} · 重复 ${group.items.length} 张</h3>
      <div class="table-wrap">
        <table class="diff-table">
          <thead>
            <tr><th>记录</th><th>票种</th><th>开票日期</th><th>报销人</th><th>价税合计</th><th>录入时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${group.items.map((item) => `
              <tr>
                <td>#${item.id}</td>
                <td>${esc(item.kind)}</td>
                <td>${esc(item.issue_date)}</td>
                <td class="${item.reimburser ? '' : 'changed'}">${esc(item.reimburser || '（待补录）')}</td>
                <td>${esc(item.total)}</td>
                <td>${esc(beijingTime(item.created_at))}</td>
                <td><button type="button" class="link danger" data-action="delete-invoice" data-id="${item.id}">删除这张</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('')
}

/** 确认导入后的结果提示：必须写清跳过了什么、或者重复的进了台账，不能让用户猜 */
function renderImportResult(result) {
  const imported = result.imported || 0
  const duplicate = result.duplicate || 0
  const skipDuplicates = result.skip_duplicates !== false
  // 预览可能被跳过或没留意，导入完再提醒一次：位数填反会让判重失效
  const numberNote = result.number_warning_count
    ? `<p class="number-note">其中 ${result.number_warning_count} 张的发票号码/代码位数可疑，
        判重按「代码+号码」算，填反后查重会失效，请到台账里核对这两列。</p>`
    : ''

  if (!skipDuplicates && duplicate) {
    return `<p class="hint">已全量导入 ${imported} 张发票，其中 ${duplicate} 张是重复的。
      重复记录已进台账，可在「查重」里清理。</p>` + numberNote
  }

  const skipped = []
  if (duplicate) skipped.push('重复 ' + duplicate + ' 张')
  if (result.invalid) skipped.push('缺发票号码 ' + result.invalid + ' 张')

  let text = '已导入 ' + imported + ' 张发票'
  if (skipped.length) text += '，跳过' + skipped.join('、')
  return `<p class="hint">${text}。</p>` + numberNote
}

const IMPORT_STATUS_LABEL = { new: '新增', duplicate: '重复', invalid: '缺号码' }
const IMPORT_PREVIEW_LIMIT = 50

/** 冲突说明：说清是跟台账哪一张撞了，还是跟本文件前面的行撞了 */
function conflictHint(item) {
  const conflict = item.conflict
  if (!conflict) return ''
  if (item.conflict_from === 'file') return '与本文件前面的行重复'
  const parts = []
  if (conflict.id) parts.push('台账 #' + conflict.id)
  if (conflict.reimburser) parts.push(conflict.reimburser)
  if (conflict.total) parts.push('¥' + conflict.total)
  return parts.length ? '与' + parts.join(' ') + ' 重复' : '与台账已有记录重复'
}

/** 预览要把台账的字段都摊开：少了代码/票种/开票日期，用户没法核对，
 *  也看不出「号码列填成了代码」这种串列问题。 */
function importRow(item, position) {
  const invoice = item.invoice
  const hint = conflictHint(item)
  const warning = item.warning
    ? `<span class="date-hint">${esc(item.warning)}</span>`
    : ''
  // 位数提示比日期提示更严重，单独用红色；号码/代码两列也跟着标出来，
  // 用户不用读说明就能看出是哪两格填反了
  const numberWarning = item.number_warning
    ? `<span class="number-hint">${esc(item.number_warning)}</span>`
    : ''
  return `
    <tr class="preview-row ${esc(item.status)}${numberWarning ? ' number-suspect' : ''}">
      <td class="muted">${position}</td>
      <td>${esc(IMPORT_STATUS_LABEL[item.status] || item.status)}</td>
      <td>${esc(invoice.number)}</td>
      <td class="muted">${esc(invoice.code)}</td>
      <td>${esc(invoice.kind)}</td>
      <td>${esc(invoice.issue_date)}</td>
      <td>${esc(invoice.total)}</td>
      <td>${esc(invoice.reimburser)}</td>
      <td>${esc(item.message)}${hint ? `<span class="conflict-hint">${esc(hint)}</span>` : ''}${numberWarning}${warning}</td>
    </tr>
  `
}

/** only: '' 全部 / duplicate 只看重复 / number 只看位数可疑。
 *  两个入口互斥，同时选等于什么都没筛；带上原始序号，筛完还能对回文件里的位置。 */
function visibleImportItems(preview, only) {
  const items = (preview.items || []).map((item, index) => ({ item: item, position: index + 1 }))
  if (only === 'duplicate') return items.filter((row) => row.item.status === 'duplicate')
  if (only === 'number') return items.filter((row) => row.item.number_warning)
  return items
}

function importDuplicateBanner(preview) {
  if (!preview.duplicate_count) return ''
  const invalid = preview.invalid_count
    ? `<p class="dup-note">缺发票号码的 ${preview.invalid_count} 张无论选哪种都不会导入。</p>`
    : ''
  return `
    <div class="dup-banner" role="status">
      <strong>发现 ${preview.duplicate_count} 张重复发票</strong>
      <p>已在下表中标红并写明与哪张重复。请确认是跳过它们，还是照样全部导入。</p>
      ${invalid}
    </div>
  `
}

function importActions(preview) {
  const dup = preview.duplicate_count || 0
  const fresh = preview.new_count || 0
  const cancel = '<button id="cancelImportBtn" type="button" class="btn btn-ghost">取消</button>'
  if (!dup) {
    return `<button id="confirmImportBtn" type="button" class="btn">确认导入 ${fresh} 张</button>${cancel}`
  }
  return `
    <button id="confirmImportBtn" type="button" class="btn">跳过 ${dup} 张重复，导入 ${fresh} 张</button>
    <button id="importAllBtn" type="button" class="btn btn-warn">全部导入（含 ${dup} 张重复）</button>
    ${cancel}
  `
}

function importTruncateNote(preview, shownCount) {
  const total = preview.total || 0
  if (!total) return ''
  if (shownCount <= IMPORT_PREVIEW_LIMIT) return ''
  const hints = []
  if (preview.duplicate_count) hints.push('重复行可点上方「只看重复」逐条核对')
  if (preview.number_warning_count) hints.push('位数可疑的行可点上方「只看位数异常」核对')
  const hint = hints.length ? '；' + hints.join('，') : ''
  return `<p class="preview-more">共 ${total} 行，仅显示前 ${IMPORT_PREVIEW_LIMIT} 行${hint}。</p>`
}

/** 日期认不出格式时不会拦截导入，但必须说清后果：这些票会被日期筛选漏掉 */
function importDateNote(preview) {
  if (!preview.date_warning_count) return ''
  return `<p class="date-note">有 ${preview.date_warning_count} 张开票日期认不出格式，会原样导入；
    台账按开票日期筛选时可能看不到它们，建议导入后在台账里改成 <code>2024-10-28</code> 这种写法。</p>`
}

/** 位数可疑也不拦截，但后果更重：判重键跟着反，重复票会被当成新票混进来。
 *  所以除了行内标红，还要给一句可以照着做的动作——取消、交换两列、重新上传。 */
function importNumberNote(preview) {
  if (!preview.number_warning_count) return ''
  return `<p class="number-note"><strong>有 ${preview.number_warning_count} 行发票号码/代码位数可疑。</strong>
    发票号码应是 8 位（数电票 20 位、且没有发票代码），发票代码是 10 或 12 位；
    两列填反时判重按「代码+号码」算出来的键也跟着反，查重会失效。
    建议取消导入、交换两列后重新上传；已经导入的可在台账里逐条改正。</p>`
}

function renderImportPreview(preview, only) {
  const visible = visibleImportItems(preview, only)
  const rows = visible.slice(0, IMPORT_PREVIEW_LIMIT)
  const dup = preview.duplicate_count || 0
  const badNumber = preview.number_warning_count || 0
  const dupChip = dup
    ? `<button type="button" class="chip ${only === 'duplicate' ? 'active' : ''}" data-action="only-duplicates">
         ${only === 'duplicate' ? '显示全部' : '只看重复 ' + dup}
       </button>`
    : ''
  const numberChip = badNumber
    ? `<button type="button" class="chip ${only === 'number' ? 'active' : ''}" data-action="only-number-warnings">
         ${only === 'number' ? '显示全部' : '只看位数异常 ' + badNumber}
       </button>`
    : ''

  $('importPreview').innerHTML = `
    <div class="preview-summary">
      <span>共 ${preview.total || 0} 行</span>
      <span class="preview-item new">新增 ${preview.new_count || 0}</span>
      <span class="preview-item duplicate">重复 ${dup}</span>
      <span class="preview-item invalid">缺号码 ${preview.invalid_count || 0}</span>
      ${preview.date_warning_count ? `<span class="preview-item warn">日期待核对 ${preview.date_warning_count}</span>` : ''}
      ${badNumber ? `<span class="preview-item number">号码待核对 ${badNumber}</span>` : ''}
      ${dupChip}${numberChip}
    </div>
    ${importDuplicateBanner(preview)}
    ${rows.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>序号</th><th>状态</th><th>发票号码</th><th>发票代码</th>
            <th>票种</th><th>开票日期</th><th>价税合计</th><th>报销人</th><th>说明</th>
          </tr></thead>
          <tbody>${rows.map((row) => importRow(row.item, row.position)).join('')}</tbody>
        </table>
      </div>
    ` : '<p class="hint">没有可预览的行。</p>'}
    ${importNumberNote(preview)}
    ${importDateNote(preview)}
    ${importTruncateNote(preview, visible.length)}
    <div class="row" style="margin-top:10px">${importActions(preview)}</div>
  `
}
