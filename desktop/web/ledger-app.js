let invoiceData = null
let selectedInvoices = new Set()
let pendingImportFile = null
let invoiceSearchTimer = null
let editingId = 0
let editingIssueRaw = ''   // 选择器认不出的旧开票日期原文，用户没重挑就原样存回

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

/**
 * 建议池：只增不减，同时记下出现次数和最近一次录入时间。
 * 直接拿当前列表会受筛选影响——一筛「待补录」就只剩空值，
 * 建议池反而丢了最常用的历史报销人。
 */
const suggestionPool = { reimburser: new Map(), kind: new Map() }

/** 统计一批台账里某个字段的出现次数与最近录入时间 */
function countValues(items, field) {
  const stats = new Map()
  items.forEach((item) => {
    const value = String(item[field] || '').trim()
    if (!value) return
    const entry = stats.get(value) || { count: 0, lastAt: '' }
    entry.count++
    const at = String(item.created_at || '')
    if (at > entry.lastAt) entry.lastAt = at
    stats.set(value, entry)
  })
  return stats
}

/** 合并历次统计：次数取历史最大值（筛选后变少也别把常用值降级），时间取最新 */
function mergeStats(pool, stats) {
  stats.forEach((entry, value) => {
    const old = pool.get(value)
    if (!old) {
      pool.set(value, entry)
      return
    }
    old.count = Math.max(old.count, entry.count)
    if (entry.lastAt > old.lastAt) old.lastAt = entry.lastAt
  })
}

/**
 * 次数降序 → 最近录入降序 → 字典序兜底。
 * 次数优先而不是拼音：误填进报销人列的数字（截图里 1/111/122 那些）只出现一次，
 * 排到后面去了，真正的人名才不会被挤出浮层的前 8 条。
 */
function orderedValues(stats) {
  return Array.from(stats.keys()).sort((a, b) => {
    const left = stats.get(a)
    const right = stats.get(b)
    if (left.count !== right.count) return right.count - left.count
    if (left.lastAt !== right.lastAt) return left.lastAt < right.lastAt ? 1 : -1
    return a.localeCompare(b, 'zh-Hans-CN')
  })
}

/** 把台账里已有的报销人/票种收进建议池，补录时可直接下拉选 */
function refreshSuggestions() {
  const items = (invoiceData && invoiceData.items) || []
  mergeStats(suggestionPool.reimburser, countValues(items, 'reimburser'))
  mergeStats(suggestionPool.kind, countValues(items, 'kind'))
  setSuggestValues('reimburser', orderedValues(suggestionPool.reimburser))
  setSuggestValues('kind', orderedValues(suggestionPool.kind))
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
  // 关掉浏览器历史自动填充，改用台账历史值的下拉（suggest.js 的浮层）
  attachSuggest(input, 'reimburser')

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
      markSuggestRecent('reimburser', value)
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
  // 从下拉建议里选一条就当场存下，不用再按回车
  input.addEventListener('change', () => finish(true))
  input.addEventListener('blur', () => finish(true))
}

function activeFilterCount() {
  const fields = ['invNumber', 'invReimburser', 'invDateFrom', 'invDateTo',
    'invCreatedFrom', 'invCreatedTo', 'invAmountMin', 'invAmountMax']
  let count = fields.filter((id) => ($(id).value || '').trim()).length
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
  ;['invNumber', 'invReimburser', 'invDateFrom', 'invDateTo',
    'invCreatedFrom', 'invCreatedTo', 'invAmountMin', 'invAmountMax']
    .forEach((id) => { $(id).value = '' })
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
    number: 'invNumber', reimburser: 'invReimburser',
    date_from: 'invDateFrom', date_to: 'invDateTo',
    created_from: 'invCreatedFrom', created_to: 'invCreatedTo',
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
  refreshSuggestions()
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

/**
 * 批量补录报销人：一次把选中的票统一成同一个姓名。
 * 用页面内模态框而非 window.prompt：原生弹窗样式割裂、拦不住误输入，也挂不了历史建议。
 */
function fillReimburserForSelected() {
  const ids = Array.from(selectedInvoices)
  if (!ids.length) return alert('请先选择发票')

  const input = $('batchReimburserInput')
  input.value = ''
  $('batchReimburserHint').textContent =
    '将把选中的 ' + ids.length + ' 张发票的报销人统一设为该姓名；留空表示清空。'
  $('batchReimburserModal').hidden = false
  input.focus()
}

function closeBatchReimburser() {
  $('batchReimburserModal').hidden = true
}

/**
 * PUT 是整条替换，必须逐条带上其余字段；串行更新，别用并发打满本地服务。
 */
async function confirmBatchReimburser() {
  const ids = Array.from(selectedInvoices)
  if (!ids.length) return closeBatchReimburser()

  const value = ($('batchReimburserInput').value || '').trim()
  closeBatchReimburser()

  let done = 0
  for (const id of ids) {
    const item = (invoiceData.items || []).find((row) => row.id === id)
    if (!item) continue
    try {
      await updateInvoice(id, invoicePayload(item, { reimburser: value }))
      done++
    } catch (error) {
      // 单条失败不打断其余，最后按成功数反馈
    }
  }
  showToast('已更新 ' + done + ' 张的报销人')
  if (done) markSuggestRecent('reimburser', value)
  await refreshLedger()
  if (window.refresh) window.refresh()
}

/** 补录与新增复用同一个弹窗：editingId 为 0 表示新增 */
function openForm(item) {
  EDIT_FIELDS.forEach(([field, id]) => { $(id).value = (item && item[field]) || '' })
  // 开票日期是原生日期选择器，只认 YYYY-MM-DD。台账里存的是无格式约束的字符串
  // （Excel 导入常见 2024/10/28、20241028，也有 111111 这种脏数据），直接塞给
  // 选择器会显示成空——所以先归一，认不出的原文记下来，保存时不能丢。
  const raw = (item && item.issue_date) || ''
  $('editIssueDate').value = dateInputValue(raw)
  editingIssueRaw = dateInputValue(raw) ? '' : raw
  editingId = item ? item.id : 0
  $('editModalTitle').textContent = item ? '补录发票信息' : '新增发票'
  $('saveEditBtn').textContent = item ? '保存补录' : '保存新增'
  $('invoiceEditModal').hidden = false
}

/** 日期选择器只认 YYYY-MM-DD；常见的 2024/10/28、2024.10.28、20241028 先归一 */
function dateInputValue(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const digits = text.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  return digits.slice(0, 4) + '-' + digits.slice(4, 6) + '-' + digits.slice(6)
}

/** 用户挑了新日期就用新的；没挑且旧值认不出，就原样存回（换控件不抹老数据） */
function dateSaveValue(raw, picked) {
  if (picked) return picked
  return dateInputValue(raw) ? '' : String(raw || '').trim()
}

function closeEdit() {
  editingId = 0
  editingIssueRaw = ''
  $('invoiceEditModal').hidden = true
}

async function saveEdit() {
  const payload = {}
  EDIT_FIELDS.forEach(([field, id]) => { payload[field] = ($(id).value || '').trim() })
  payload.issue_date = dateSaveValue(editingIssueRaw, payload.issue_date)
  if (!payload.number) return alert('发票号码不能为空')

  const creating = !editingId
  try {
    if (creating) await createInvoice(payload)
    else await updateInvoice(editingId, payload)
    markSuggestRecent('reimburser', payload.reimburser)
    markSuggestRecent('kind', payload.kind)
    closeEdit()
    await refreshLedger()
    if (window.refresh) window.refresh()
    if (creating) showToast('已新增发票 ' + payload.number)
  } catch (error) {
    alert((creating ? '新增' : '补录') + '失败：' + error.message)
  }
}

/**
 * 解析粘贴进弹窗的一行发票文本；认不出返回 null，让原生粘贴照常生效。
 * 只认两种确定格式：
 *   1. 数电票扫码串 01,31,,号码,金额(元),YYYYMMDD,,校验
 *   2. Excel 一行（制表符分隔）：号码/代码/票种/日期/金额/报销人
 * 宁可少认，也不要瞎猜——猜错一次用户就得手改六个字段。
 */
function parsePastedInvoice(text) {
  const line = String(text || '').trim()
  if (!line || line.indexOf('\n') >= 0) return null

  const comma = line.split(',')
  if (comma.length >= 6) {
    const number = (comma[3] || '').trim()
    const amount = (comma[4] || '').trim()
    const date = (comma[5] || '').trim()
    if (/^\d{8,20}$/.test(number) && /^\d+(\.\d+)?$/.test(amount) && /^\d{8}$/.test(date)) {
      return {
        number: number,
        issue_date: date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8),
        total: Number(amount).toFixed(2)
      }
    }
  }

  const cells = line.split('\t').map((cell) => cell.trim())
  if (cells.length >= 4) {
    return {
      number: cells[0] || '',
      code: cells[1] || '',
      kind: cells[2] || '',
      issue_date: cells[3] || '',
      total: cells[4] || '',
      reimburser: cells[5] || ''
    }
  }
  return null
}

/** 弹窗里粘贴整行时自动拆字段；单值粘贴不拦 */
function bindPasteParse() {
  const modal = $('invoiceEditModal')
  if (!modal) return
  modal.addEventListener('paste', (event) => {
    const text = (event.clipboardData && event.clipboardData.getData('text')) || ''
    const parsed = parsePastedInvoice(text)
    if (!parsed) return

    let filled = 0
    EDIT_FIELDS.forEach(([field, id]) => {
      const value = parsed[field]
      if (!value) return
      $(id).value = value
      filled++
    })
    if (!filled) return
    event.preventDefault()
    showToast('已按粘贴内容填入 ' + filled + ' 个字段')
  })
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
  // 历史值下拉统一走页面内浮层（suggest.js）：原生 datalist 的弹出层没法跟页面风格对齐
  attachSuggest($('editKind'), 'kind')
  attachSuggest($('editReimburser'), 'reimburser')
  attachSuggest($('batchReimburserInput'), 'reimburser')

  ;['invNumber', 'invReimburser', 'invDateFrom', 'invDateTo',
    'invCreatedFrom', 'invCreatedTo', 'invAmountMin', 'invAmountMax'].forEach((id) => {
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
    if (event.target.closest('#confirmBatchReimburserBtn')) return confirmBatchReimburser()
    if (event.target.closest('#closeBatchReimburserBtn') || event.target.closest('#cancelBatchReimburserBtn')) {
      return closeBatchReimburser()
    }
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
    if (event.target.closest('#invoiceFillReimburserBtn')) {
      fillReimburserForSelected()
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

  $('batchReimburserModal').addEventListener('click', (event) => {
    if (event.target.id === 'batchReimburserModal') closeBatchReimburser()
  })
  $('batchReimburserInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') confirmBatchReimburser()
  })
  bindPasteParse()

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
