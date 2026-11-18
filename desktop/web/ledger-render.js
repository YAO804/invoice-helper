function renderInvoiceStats(data) {
  $('invTotal').textContent = data.total || 0
  $('invDuplicates').textContent = data.duplicate_groups || 0
  $('invNeedFill').textContent = data.need_fill || 0
  // 用后端给的全表最新批次，不看当前列表第一行：
  // 这张卡片同时是筛选入口，值必须稳定，不能跟着筛选结果漂
  $('invBatch').textContent = data.latest_batch || '—'
  $('lastInvoiceRefresh').textContent = '更新于 ' + new Date().toLocaleTimeString()
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
  const text = String(value || '')
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
    body.innerHTML = emptyRow('没有匹配的发票', 10)
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
      <td class="col-batch" title="${esc(item.batch)}">${esc(item.batch)}</td>
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
            <tr><th>记录</th><th>票种</th><th>开票日期</th><th>报销人</th><th>价税合计</th><th>批次</th><th>录入时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${group.items.map((item) => `
              <tr>
                <td>#${item.id}</td>
                <td>${esc(item.kind)}</td>
                <td>${esc(item.issue_date)}</td>
                <td class="${item.reimburser ? '' : 'changed'}">${esc(item.reimburser || '（待补录）')}</td>
                <td>${esc(item.total)}</td>
                <td>${esc(item.batch)}</td>
                <td>${esc(item.created_at)}</td>
                <td><button type="button" class="link danger" data-action="delete-invoice" data-id="${item.id}">删除这张</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('')
}

function renderImportPreview(preview) {
  $('importPreview').innerHTML = `
    <div class="preview-summary">
      <span>共 ${preview.total || 0} 行</span>
      <span class="preview-item new">新增 ${preview.new_count || 0}</span>
      <span class="preview-item duplicate">重复 ${preview.duplicate_count || 0}</span>
      <span class="preview-item invalid">无效 ${preview.invalid_count || 0}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>状态</th><th>发票号码</th><th>报销人</th><th>价税合计</th><th>说明</th></tr></thead>
        <tbody>
          ${(preview.items || []).slice(0, 50).map((item) => `
            <tr class="preview-item ${esc(item.status)}">
              <td>${esc(item.status)}</td>
              <td>${esc(item.invoice.number)}</td>
              <td>${esc(item.invoice.reimburser || '')}</td>
              <td>${esc(item.invoice.total)}</td>
              <td>${esc(item.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="row" style="margin-top:10px">
      <button id="confirmImportBtn" type="button">确认导入</button>
      <button id="cancelImportBtn" type="button" class="secondary">取消</button>
    </div>
  `
}
