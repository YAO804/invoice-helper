function renderInvoiceStats(data) {
  $('invTotal').textContent = data.total || 0
  $('invDuplicates').textContent = data.duplicate_groups || 0
  $('invNeedFill').textContent = data.need_fill || 0
  const items = data.items || []
  $('invBatch').textContent = items.length && items[0].batch ? items[0].batch : '—'
  $('lastInvoiceRefresh').textContent = '更新于 ' + new Date().toLocaleTimeString()
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

function renderInvoiceTable(items, selected) {
  const body = $('invoiceBody')
  if (!items || !items.length) {
    body.innerHTML = '<tr><td colspan="16" class="empty">没有匹配的发票</td></tr>'
    return
  }

  body.innerHTML = items.map((item) => `
    <tr class="${item.duplicate ? 'duplicate' : ''}">
      <td><input type="checkbox" class="invoice-check" data-id="${item.id}" ${selected.has(item.id) ? 'checked' : ''}></td>
      <td>${esc(item.number)}${item.duplicate ? '<span class="badge dup">重复</span>' : ''}${item.need_fill ? '<span class="badge fill">待补录</span>' : ''}</td>
      <td>${esc(item.code)}</td>
      <td>${esc(item.kind)}</td>
      <td>${esc(item.issue_date)}</td>
      <td>${esc(item.seller_name)}</td>
      <td>${esc(item.seller_tax_id)}</td>
      <td>${esc(item.buyer_name)}</td>
      <td>${esc(item.buyer_tax_id)}</td>
      <td>${esc(item.amount)}</td>
      <td>${esc(item.tax)}</td>
      <td>${esc(item.total)}</td>
      <td>${esc(item.tax_rate)}</td>
      <td>${esc(item.batch)}</td>
      <td>${esc(item.created_at)}</td>
      <td>
        <button type="button" class="link" data-action="edit-invoice" data-id="${item.id}">补录</button>
        <button type="button" class="link danger" data-action="delete-invoice" data-id="${item.id}">删除</button>
      </td>
    </tr>
  `).join('')
}

function renderDuplicatePanel(groups) {
  if (!groups || !groups.length) {
    $('duplicateBody').innerHTML = '<p class="empty">没有重复发票</p>'
    return
  }

  $('duplicateBody').innerHTML = groups.map((group) => `
    <div class="duplicate-group">
      <h3>发票号码 ${esc(group.number)} · 重复 ${group.items.length} 张</h3>
      <div class="table-wrap">
        <table class="diff-table">
          <thead>
            <tr><th>记录</th><th>票种</th><th>开票日期</th><th>销方名称</th><th>价税合计</th><th>批次</th><th>录入时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            ${group.items.map((item) => `
              <tr>
                <td>#${item.id}</td>
                <td>${esc(item.kind)}</td>
                <td>${esc(item.issue_date)}</td>
                <td class="${item.seller_name ? '' : 'changed'}">${esc(item.seller_name || '（空）')}</td>
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
        <thead><tr><th>状态</th><th>发票号码</th><th>销方名称</th><th>价税合计</th><th>说明</th></tr></thead>
        <tbody>
          ${(preview.items || []).slice(0, 50).map((item) => `
            <tr class="preview-item ${esc(item.status)}">
              <td>${esc(item.status)}</td>
              <td>${esc(item.invoice.number)}</td>
              <td>${esc(item.invoice.seller_name)}</td>
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
