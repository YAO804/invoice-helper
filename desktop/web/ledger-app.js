let invoiceData = null
let selectedInvoices = new Set()
let pendingImportFile = null
let invoiceSearchTimer = null
let editingId = 0

const EDIT_FIELDS = [
  ['number', 'editNumber'], ['code', 'editCode'], ['kind', 'editKind'],
  ['issue_date', 'editIssueDate'], ['total', 'editTotal'],
  ['reimburser', 'editReimburser']
]

function showToast(message) {
  const box = $('toast')
  box.textContent = message
  box.hidden = false
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(() => { box.hidden = true }, 1800)
}

async function copyInvoiceValue(button) {
  const text = button.dataset.copy || ''
  if (!text) return
  await copyText(text)
  const label = button.textContent.trim()
  button.classList.add('copied')
  showToast('已复制：' + label)
  setTimeout(() => button.classList.remove('copied'), 1200)
}

/** PUT /api/invoices/{id} 是整条替换（仅保留批次与录入时间），必须带上其余字段 */
function invoicePayload(item, overrides) {
  const payload = {
    number: item.number || '',
    code: item.code || '',
    kind: item.kind || '',
    issue_date: item.issue_date || '',
    total: item.total || '',
    reimburser: item.reimburser || ''
  }
  return Object.assign(payload, overrides || {})
}

/** 报销人单元格行内编辑：Enter/Tab/失焦保存，Esc 取消 */
function startReimburserEdit(cell) {
  if (cell.dataset.editing === '1') return
  const id = Number(cell.dataset.id)
  const item = (invoiceData.items || []).find((row) => row.id === id)
  if (!item) return

  const original = item.reimburser || ''
  const input = document.createElement('input')
  input.className = 'inline-input'
  input.type = 'text'
  input.value = original
  input.placeholder = '输入报销人'
  input.setAttribute('aria-label', '报销人')
  input.autocomplete = 'off'

  cell.dataset.editing = '1'
  cell.classList.add('cell-editing')
  cell.textContent = ''
  cell.appendChild(input)
  input.focus()
  input.select()

  let done = false
  const restore = () => {
    cell.classList.remove('cell-editing')
    cell.dataset.editing = '0'
    renderInvoiceTable(invoiceData.items || [], selectedInvoices)
  }

  const finish = async (save) => {
    if (done) return
    done = true
    const value = input.value.trim()
    input.disabled = true
    if (!save || value === original) return restore()

    try {
      await updateInvoice(id, invoicePayload(item, { reimburser: value }))
      showToast(value ? '报销人已保存：' + value : '已清空报销人')
      await refreshLedger()
      if (window.refresh) window.refresh()
    } catch (error) {
      showToast('保存失败：' + error.message)
      restore()
    }
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  })
  input.addEventListener('blur', () => finish(true))
}

function activeFilterCount() {
  const fields = ['invNumber', 'invReimburser', 'invBatchFilter', 'invDateFrom', 'invDateTo', 'invAmountMin', 'invAmountMax']
  let count = fields.filter((id) => ($(id).value || '').trim()).length
  if (($('invKeyword').value || '').trim()) count++
  if ($('invOnlyDuplicates').checked) count++
  if ($('invOnlyNeedFill').checked) count++
  return count
}

function syncFilterCount() {
  const n = activeFilterCount()
  const badge = $('filterCount')
  badge.textContent = n
  badge.hidden = n === 0
}

function resetFilters() {
  ;['invKeyword', 'invNumber', 'invReimburser', 'invBatchFilter', 'invDateFrom', 'invDateTo',
    'invAmountMin', 'invAmountMax'].forEach((id) => { $(id).value = '' })
  $('invOnlyDuplicates').checked = false
  $('invOnlyNeedFill').checked = false
  syncFilterCount()
  refreshLedger()
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.invoice-check').forEach((box) => {
    box.checked = checked
    if (checked) selectedInvoices.add(Number(box.dataset.id))
    else selectedInvoices.delete(Number(box.dataset.id))
  })
  $('selectAll').checked = checked
  renderSelectionSummary(currentItems(), selectedInvoices)
}

/** 当前列表数据，汇总与全选都从这里取，避免各写一份 invoiceData.items */
function currentItems() {
  return (invoiceData && invoiceData.items) || []
}

function buildInvoiceParams() {
  const params = new URLSearchParams()
  const fields = {
    keyword: 'invKeyword', number: 'invNumber', reimburser: 'invReimburser',
    batch: 'invBatchFilter', date_from: 'invDateFrom', date_to: 'invDateTo',
    amount_min: 'invAmountMin', amount_max: 'invAmountMax'
  }
  Object.keys(fields).forEach((key) => {
    const value = ($(fields[key]).value || '').trim()
    if (value) params.set(key, value)
  })
  if ($('invOnlyDuplicates').checked) params.set('only_duplicates', '1')
  if ($('invOnlyNeedFill').checked) params.set('only_need_fill', '1')
  params.set('sort', $('invSort').value)
  return params
}

function syncSelected(items) {
  const visible = new Set(items.map((item) => item.id))
  selectedInvoices.forEach((id) => {
    if (!visible.has(id)) selectedInvoices.delete(id)
  })
}

function renderInvoiceAll() {
  if (!invoiceData) return
  const items = invoiceData.items || []
  syncSelected(items)
  renderInvoiceStats(invoiceData)
  renderDuplicateAlert(invoiceData.duplicates || [])
  renderInvoiceTable(items, selectedInvoices)
  renderDuplicatePanel(invoiceData.duplicates || [])
  renderSelectionSummary(items, selectedInvoices)
  syncStatFilterState()
  const allChecked = items.length > 0 && items.every((item) => selectedInvoices.has(item.id))
  $('selectAll').checked = allChecked
}

async function refreshLedger() {
  try {
    invoiceData = await fetchInvoices(buildInvoiceParams())
    renderInvoiceAll()
  } catch (error) {
    $('lastInvoiceRefresh').textContent = '刷新失败：' + error.message
  }
}

function scheduleLedgerRefresh() {
  syncFilterCount()
  syncStatFilterState()
  clearTimeout(invoiceSearchTimer)
  invoiceSearchTimer = setTimeout(refreshLedger, 250)
}

async function previewImport() {
  const file = $('invoiceImportFile').files[0]
  if (!file) {
    alert('请先选择 CSV 文件')
    return
  }
  try {
    pendingImportFile = file
    renderImportPreview(await previewInvoiceImport(file))
  } catch (error) {
    alert('预览失败：' + error.message)
  }
}

async function confirmImport() {
  if (!pendingImportFile) {
    alert('请先预览导入文件')
    return
  }
  try {
    const result = await commitInvoiceImport(pendingImportFile)
    $('importPreview').innerHTML = `<p class="hint">已导入 ${result.imported} 张发票。</p>`
    pendingImportFile = null
    $('invoiceImportFile').value = ''
    await refreshLedger()
    if (window.refresh) window.refresh()
  } catch (error) {
    alert('导入失败：' + error.message)
  }
}

async function removeInvoices(ids) {
  if (!ids.length) return
  if (!confirm('确定删除选中的 ' + ids.length + ' 张发票？删除后不可恢复。')) return

  try {
    await deleteInvoices(ids)
    selectedInvoices.clear()
    await refreshLedger()
    if (window.refresh) window.refresh()
  } catch (error) {
    alert('删除失败：' + error.message)
  }
}

/** 补录与新增复用同一个弹窗：editingId 为 0 表示新增 */
function openForm(item) {
  EDIT_FIELDS.forEach(([field, id]) => { $(id).value = (item && item[field]) || '' })
  editingId = item ? item.id : 0
  $('editModalTitle').textContent = item ? '补录发票信息' : '新增发票'
  $('saveEditBtn').textContent = item ? '保存补录' : '保存新增'
  $('invoiceEditModal').hidden = false
}

function closeEdit() {
  editingId = 0
  $('invoiceEditModal').hidden = true
}

async function saveEdit() {
  const payload = {}
  EDIT_FIELDS.forEach(([field, id]) => { payload[field] = ($(id).value || '').trim() })
  if (!payload.number) return alert('发票号码不能为空')

  const creating = !editingId
  try {
    if (creating) await createInvoice(payload)
    else await updateInvoice(editingId, payload)
    closeEdit()
    await refreshLedger()
    if (window.refresh) window.refresh()
    if (creating) showToast('已新增发票 ' + payload.number)
  } catch (error) {
    alert((creating ? '新增' : '补录') + '失败：' + error.message)
  }
}

function purgeRange(confirm) {
  const from = $('invPurgeFrom').value
  const to = $('invPurgeTo').value
  if (!from && !to) return alert('请选择录入时间的起止日期')
  if (confirm && !window.confirm('确定清理这段时间录入的发票？清理前会自动备份。')) return

  return purgeInvoices(from, to, confirm).then((result) => {
    $('purgeResult').textContent = confirm
      ? '已清理 ' + result.removed + ' 张发票。'
      : '该时间段有 ' + result.removed + ' 张发票，确认后将删除。'
    if (confirm) return refreshLedger()
  }).catch((error) => alert('清理失败：' + error.message))
}

function openDrawer() {
  $('duplicateDrawer').hidden = false
}

function closeDrawer() {
  $('duplicateDrawer').hidden = true
}

function bindLedgerEvents() {
  ;['invKeyword', 'invNumber', 'invReimburser', 'invBatchFilter', 'invDateFrom',
    'invDateTo', 'invAmountMin', 'invAmountMax'].forEach((id) => {
    $(id).addEventListener('input', scheduleLedgerRefresh)
  })
  $('invOnlyDuplicates').addEventListener('change', () => { syncStatFilterState(); refreshLedger() })
  $('invOnlyNeedFill').addEventListener('change', () => { syncStatFilterState(); refreshLedger() })
  $('invSort').addEventListener('change', refreshLedger)

  $('ledgerRefreshBtn').addEventListener('click', refreshLedger)
  $('filterToggleBtn').addEventListener('click', () => {
    const panel = $('filterPanel')
    const open = panel.hidden
    panel.hidden = !open
    $('filterToggleBtn').setAttribute('aria-expanded', String(open))
  })
  $('filterResetBtn').addEventListener('click', resetFilters)
  $('selectAll').addEventListener('change', (event) => toggleSelectAll(event.target.checked))

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!target || typeof target.closest !== 'function') return
    const cell = target.closest('.reimburser-cell[data-action="edit-reimburser"]')
    if (!cell || cell.dataset.editing === '1') return
    event.preventDefault()
    startReimburserEdit(cell)
  })

  document.addEventListener('change', (event) => {
    if (!event.target.classList.contains('invoice-check')) return
    const id = Number(event.target.dataset.id)
    if (event.target.checked) selectedInvoices.add(id)
    else selectedInvoices.delete(id)
    renderSelectionSummary(currentItems(), selectedInvoices)
    const boxes = Array.from(document.querySelectorAll('.invoice-check'))
    $('selectAll').checked = boxes.length > 0 && boxes.every((box) => box.checked)
  })

  document.addEventListener('click', (event) => {
    // 统计卡片：点一下筛一类，再点一次取消。条件写回筛选面板，两处共用一份状态
    const statCard = event.target.closest('[data-stat-filter]')
    if (statCard) {
      if (toggleStatFilter(statCard.dataset.statFilter)) {
        syncFilterCount()
        refreshLedger()
      }
      return
    }
    const copyButton = event.target.closest('.copy-cell')
    if (copyButton) {
      copyInvoiceValue(copyButton)
      return
    }
    const reimburserCell = event.target.closest('[data-action="edit-reimburser"]')
    if (reimburserCell) {
      startReimburserEdit(reimburserCell)
      return
    }
    const editButton = event.target.closest('[data-action="edit-invoice"]')
    if (editButton) {
      const item = (invoiceData.items || []).find((row) => row.id === Number(editButton.dataset.id))
      if (item) openForm(item)
      return
    }
    if (event.target.closest('#invoiceCreateBtn')) return openForm(null)
    if (event.target.closest('#saveEditBtn')) return saveEdit()
    if (event.target.closest('#closeEditBtn') || event.target.closest('#cancelEditBtn')) return closeEdit()
    if (event.target.closest('#invoicePurgePreviewBtn')) return purgeRange(false)
    if (event.target.closest('#invoicePurgeBtn')) return purgeRange(true)

    const button = event.target.closest('[data-action="delete-invoice"]')
    if (button) {
      removeInvoices([Number(button.dataset.id)])
      return
    }
    if (event.target.closest('#openDuplicateDrawerBtn')) openDrawer()
    if (event.target.closest('#closeDrawerBtn')) closeDrawer()
    if (event.target.closest('#invoiceImportBtn')) previewImport()
    if (event.target.closest('#confirmImportBtn')) confirmImport()
    if (event.target.closest('#cancelImportBtn')) {
      pendingImportFile = null
      $('invoiceImportFile').value = ''
      $('importPreview').innerHTML = ''
    }
    if (event.target.closest('#invoiceExportAllBtn')) downloadInvoiceCSV(new URLSearchParams())
    if (event.target.closest('#invoiceExportSelectedBtn')) {
      if (!selectedInvoices.size) return alert('请先选择发票')
      const params = buildInvoiceParams()
      params.set('ids', Array.from(selectedInvoices).join(','))
      downloadInvoiceCSV(params)
    }
    if (event.target.closest('#invoiceDeleteSelectedBtn')) {
      removeInvoices(Array.from(selectedInvoices))
    }
  })

  $('duplicateDrawer').addEventListener('click', (event) => {
    if (event.target.id === 'duplicateDrawer') closeDrawer()
  })

  $('invoiceEditModal').addEventListener('click', (event) => {
    if (event.target.id === 'invoiceEditModal') closeEdit()
  })

  setInterval(() => {
    if (!$('pageLedger').hidden) refreshLedger()
  }, 10000)
}

/**
 * 登录成功后由 login.js 调用，才开始拉台账数据。
 * window.refreshLedger 提前挂好，控制台页切换标签时要用。
 */
function startLedgerApp() {
  if (window.__ledgerStarted) return
  window.__ledgerStarted = true
  bindLedgerEvents()
  refreshLedger()
}

window.refreshLedger = refreshLedger
window.startLedgerApp = startLedgerApp
