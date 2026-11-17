let invoiceData = null
let selectedInvoices = new Set()
let pendingImportFile = null
let invoiceSearchTimer = null

function buildInvoiceParams() {
  const params = new URLSearchParams()
  const fields = {
    keyword: 'invKeyword', number: 'invNumber', seller: 'invSeller',
    batch: 'invBatchFilter', date_from: 'invDateFrom', date_to: 'invDateTo',
    amount_min: 'invAmountMin', amount_max: 'invAmountMax'
  }
  Object.keys(fields).forEach((key) => {
    const value = ($(fields[key]).value || '').trim()
    if (value) params.set(key, value)
  })
  if ($('invOnlyDuplicates').checked) params.set('only_duplicates', '1')
  if ($('invOnlyNeedFill').checked) params.set('only_need_fill', '1')
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
  $('invoiceSelectedCount').textContent = selectedInvoices.size
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

function openDrawer() {
  $('duplicateDrawer').hidden = false
}

function closeDrawer() {
  $('duplicateDrawer').hidden = true
}

function bindLedgerEvents() {
  ;['invKeyword', 'invNumber', 'invSeller', 'invBatchFilter', 'invDateFrom',
    'invDateTo', 'invAmountMin', 'invAmountMax'].forEach((id) => {
    $(id).addEventListener('input', scheduleLedgerRefresh)
  })
  $('invOnlyDuplicates').addEventListener('change', refreshLedger)
  $('invOnlyNeedFill').addEventListener('change', refreshLedger)

  document.addEventListener('change', (event) => {
    if (!event.target.classList.contains('invoice-check')) return
    const id = Number(event.target.dataset.id)
    if (event.target.checked) selectedInvoices.add(id)
    else selectedInvoices.delete(id)
    $('invoiceSelectedCount').textContent = selectedInvoices.size
  })

  document.addEventListener('click', (event) => {
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

  setInterval(() => {
    if (!$('pageLedger').hidden) refreshLedger()
  }, 10000)
}

bindLedgerEvents()
refreshLedger()
window.refreshLedger = refreshLedger
