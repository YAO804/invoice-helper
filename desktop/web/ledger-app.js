let invoiceData = null
let selectedInvoices = new Set()
let pendingImportFile = null
let pendingImportPreview = null
// 预览的筛选维度：'' 全部 / duplicate 只看重复 / number 只看号码位数可疑
let importOnly = ''
let invoiceSearchTimer = null
let editingId = 0
let editingIssueRaw = ''   // 选择器认不出的旧开票日期原文，用户没重挑就原样存回
// 两个弹窗各自的字段快照：非空说明这次打开改过内容，关之前要问一句
let editSnapshot = null
let batchSnapshot = null
let numberWarningTimer = null
let numberWarningSeq = 0   // 关掉弹窗或又改了值时，作废在途的提示请求

/** 每页条数。两万行时一次全量返回 4.7MB，浏览器渲染直接卡住 */
const INVOICE_PAGE_SIZE = 20
let invoicePage = 1

/**
 * 本次筛选下「见过的所有发票 id」。
 *
 * 分页之后不能拿当前页去判断选中项还在不在——翻页会把上一页勾的票当成已消失清掉。
 * 换筛选条件时清空它，等于换了一份列表，之前在其他页勾的票不再属于当前视图。
 */
let knownInvoiceIds = new Set()

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
 * 建议池：值 → { count, lastAt }，由后端按整份台账统计好后灌进来。
 * 不能拿当前列表自己算——分页只剩一页，筛选后又只剩空值，
 * 两种情况下都会把最常用的历史报销人挤掉。
 */
const suggestionPool = { reimburser: new Map(), kind: new Map() }

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

/**
 * 把台账里已有的报销人/票种收进建议池，补录时可直接下拉选。
 *
 * 统计口径来自后端（`suggestions` 字段，按整份台账算）。分页之后前端手里只有
 * 一页数据，再拿 items 重建就会把「常用报销人」缩水成「这一页出现过的报销人」。
 * 后端给的是全量，所以每次都能整份重建：报销人改名、发票删掉之后旧值会干净消失。
 */
function refreshSuggestions() {
  const suggestions = (invoiceData && invoiceData.suggestions) || {}
  rebuildSuggestPool('reimburser', suggestions.reimburser)
  rebuildSuggestPool('kind', suggestions.kind)
}

function rebuildSuggestPool(key, entries) {
  const stats = suggestionPool[key]
  stats.clear()
  ;(entries || []).forEach((entry) => {
    const value = String(entry.value || '').trim()
    if (!value) return
    stats.set(value, { count: entry.count || 0, lastAt: entry.last_at || '' })
  })
  setSuggestValues(key, orderedValues(stats))
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
  resetInvoiceView()
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
  params.set('page', String(invoicePage))
  params.set('page_size', String(INVOICE_PAGE_SIZE))
  return params
}

/** 换筛选条件或排序等于换了一份列表：回到第 1 页，并让旧的跨页勾选失效 */
function resetInvoiceView() {
  invoicePage = 1
  knownInvoiceIds.clear()
}

/**
 * 清掉已经不存在于任何一页的选中项。
 *
 * 判断依据是「本次筛选下见过的 id」，不是「当前页的 id」：翻页时上一页勾的票
 * 必须留着，否则跨页批量操作没法用。
 */
function syncSelected(items) {
  items.forEach((item) => knownInvoiceIds.add(item.id))
  selectedInvoices.forEach((id) => {
    if (!knownInvoiceIds.has(id)) selectedInvoices.delete(id)
  })
}

function goInvoicePage(target) {
  const data = invoiceData || {}
  const count = Math.max(1, data.page_count || 1)
  const next = Math.min(Math.max(1, Number(target) || 1), count)
  if (next === (data.page || invoicePage)) return
  invoicePage = next
  refreshLedger()
}

function renderInvoiceAll() {
  if (!invoiceData) return
  const items = invoiceData.items || []
  // 后端会把越界页码贴回有效页，前端跟着它走，免得两边对不上
  invoicePage = invoiceData.page || invoicePage
  syncSelected(items)
  renderInvoiceStats(invoiceData)
  renderDuplicateAlert(invoiceData.duplicates || [])
  renderInvoiceTable(items, selectedInvoices)
  renderInvoicePager(invoiceData)
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
  resetInvoiceView()
  syncFilterCount()
  syncStatFilterState()
  clearTimeout(invoiceSearchTimer)
  invoiceSearchTimer = setTimeout(refreshLedger, 250)
}

/** 后端文案往往自带动作前缀（「导入失败: …」），前端再拼一次就成了「导入失败：导入失败: …」 */
function alertFailure(prefix, error) {
  const message = (error && error.message) || String(error)
  alert(message.indexOf(prefix) >= 0 ? message : prefix + '：' + message)
}

async function previewImportFile(file) {
  if (!file) {
    alert('请先选择 Excel（.xlsx）文件')
    return
  }
  try {
    pendingImportFile = file
    pendingImportPreview = await previewInvoiceImport(file)
    importOnly = ''
    renderImportPreview(pendingImportPreview, importOnly)
  } catch (error) {
    alertFailure('预览失败', error)
  }
}

/** 两个筛选入口共用：点已激活的那个回到全部，不重新请求，直接按现有结果重绘 */
function toggleImportOnly(kind) {
  if (!pendingImportPreview) return
  importOnly = importOnly === kind ? '' : kind
  renderImportPreview(pendingImportPreview, importOnly)
}

function previewImport() {
  previewImportFile($('invoiceImportFile').files[0])
}

function openPasteImport() {
  $('pasteImportModal').hidden = false
  $('pasteImportHint').textContent = ''
  $('pasteImportText').focus()
}

function closePasteImport() {
  $('pasteImportModal').hidden = true
}

/** 把 Excel 粘贴的 TSV 转成 File，交给同一条预览链路处理。 */
function previewPasteImport() {
  const text = $('pasteImportText').value
  const error = pasteImportError(text)
  if (error) {
    $('pasteImportHint').textContent = error
    return
  }
  const csv = tsvToCSV(text)
  const file = new File([csv], '粘贴导入.csv', { type: 'text/csv' })
  closePasteImport()
  previewImportFile(file)
}

/** skipDuplicates=true 走「跳过重复」，false 走「全部导入（含重复）」 */
async function commitPendingImport(skipDuplicates) {
  if (!pendingImportFile) {
    alert('请先预览导入文件')
    return
  }
  try {
    const result = await commitInvoiceImport(pendingImportFile, skipDuplicates)
    $('importPreview').innerHTML = renderImportResult(result)
    pendingImportFile = null
    pendingImportPreview = null
    $('invoiceImportFile').value = ''
    await refreshLedger()
    if (window.refresh) window.refresh()
  } catch (error) {
    alertFailure('导入失败', error)
  }
}

function confirmImport() {
  return commitPendingImport(true)
}

/** 用户明确选择不跳过重复：会造出重复记录，所以再确认一次 */
function importAllIncludingDuplicates() {
  const duplicate = pendingImportPreview ? pendingImportPreview.duplicate_count || 0 : 0
  const ok = confirm(
    `确定把 ${duplicate} 张重复发票也导入台账？\n\n` +
      '导入后台账里会有重复记录，需要去「查重」里手工清理。'
  )
  if (!ok) return
  return commitPendingImport(false)
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
    alertFailure('删除失败', error)
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
  batchSnapshot = captureFields([['reimburser', 'batchReimburserInput']])
  $('batchReimburserHint').textContent =
    '将把选中的 ' + ids.length + ' 张发票的报销人统一设为该姓名；留空表示清空。'
  $('batchReimburserModal').hidden = false
  input.focus()
}

function closeBatchReimburser() {
  batchSnapshot = null
  $('batchReimburserModal').hidden = true
}

function requestCloseBatchReimburser() {
  if (!allowDiscard(fieldsDirty(batchSnapshot, [['reimburser', 'batchReimburserInput']]),
    '报销人还没提交，确定放弃吗？')) return
  closeBatchReimburser()
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
  editSnapshot = captureFields(EDIT_FIELDS)
  $('invoiceEditModal').hidden = false
  refreshNumberWarning()
}

/** 手动录入的位数提示：文案和字段归属都来自后端，网页只负责放到对应输入框下面 */
function renderNumberWarning(issue) {
  const warning = (issue && issue.warning) || ''
  const field = (issue && issue.field) || ''
  const boxes = { number: $('editNumberWarning'), code: $('editCodeWarning') }
  Object.keys(boxes).forEach((key) => {
    // 两列都填反时只放代码下面，同一句话重复两遍反而看不清是哪格的问题
    const show = !!warning && (field === key || (field === 'both' && key === 'code'))
    boxes[key].textContent = show ? warning : ''
    boxes[key].hidden = !show
  })
}

async function refreshNumberWarning() {
  const seq = ++numberWarningSeq
  const number = ($('editNumber').value || '').trim()
  const code = ($('editCode').value || '').trim()
  if (!number && !code) return renderNumberWarning(null)

  try {
    const result = await fetchNumberWarning(number, code)
    // 表单已经关掉或用户又改了值，旧结果不能再盖上去
    if (seq === numberWarningSeq) renderNumberWarning(result)
  } catch (_) {
    // 提示是辅助：接口暂时不通也不能挡住录入，保存后后端还会再给一次
    if (seq === numberWarningSeq) renderNumberWarning(null)
  }
}

function scheduleNumberWarning() {
  clearTimeout(numberWarningTimer)
  numberWarningTimer = setTimeout(refreshNumberWarning, 200)
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
  editSnapshot = null
  numberWarningSeq++
  renderNumberWarning(null)
  $('invoiceEditModal').hidden = true
}

/** 遮罩、取消、Esc 都走这里：改过内容要用户点头才丢 */
function requestCloseEdit() {
  if (!allowDiscard(fieldsDirty(editSnapshot, EDIT_FIELDS), '已填的内容还没保存，确定放弃吗？')) return
  closeEdit()
}

async function saveEdit() {
  const payload = {}
  EDIT_FIELDS.forEach(([field, id]) => { payload[field] = ($(id).value || '').trim() })
  payload.issue_date = dateSaveValue(editingIssueRaw, payload.issue_date)
  if (!payload.number) return alert('发票号码不能为空')

  const creating = !editingId
  try {
    const response = creating ? await createInvoice(payload) : await updateInvoice(editingId, payload)
    markSuggestRecent('reimburser', payload.reimburser)
    markSuggestRecent('kind', payload.kind)
    closeEdit()
    await refreshLedger()
    if (window.refresh) window.refresh()
    if (response && response.number_warning) {
      // 实时提示可能被用户忽略或接口失败过；保存后这是最后一道提醒，
      // 但仍不拦：数据已经按用户要求写进去了，让他自己决定改不改。
      alert((creating ? '已新增发票 ' : '已补录发票 ') + payload.number + '。\n\n' +
        response.number_warning + '\n\n发票已保存，请在台账里核对这两列。')
    } else if (creating) showToast('已新增发票 ' + payload.number)
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
  }).catch((error) => alertFailure('清理失败', error))
}

function openDrawer() {
  $('duplicateDrawer').hidden = false
}

function closeDrawer() {
  $('duplicateDrawer').hidden = true
}

function bindLedgerEvents() {
  // 文件选择框是 hidden 的，必须由按钮 click 触发；选完文件靠 change 进入预览。
  // 原来只有按钮点击去读 files[0]，从不触发选择框，所以点了没反应。
  $('invoiceImportFile').addEventListener('change', previewImport)

  // 历史值下拉统一走页面内浮层（suggest.js）：原生 datalist 的弹出层没法跟页面风格对齐
  attachSuggest($('editKind'), 'kind')
  attachSuggest($('editReimburser'), 'reimburser')
  attachSuggest($('batchReimburserInput'), 'reimburser')

  $('editNumber').addEventListener('input', scheduleNumberWarning)
  $('editCode').addEventListener('input', scheduleNumberWarning)

  ;['invNumber', 'invReimburser', 'invDateFrom', 'invDateTo',
    'invCreatedFrom', 'invCreatedTo', 'invAmountMin', 'invAmountMax'].forEach((id) => {
    $(id).addEventListener('input', scheduleLedgerRefresh)
  })
  $('invOnlyDuplicates').addEventListener('change', () => { resetInvoiceView(); syncStatFilterState(); refreshLedger() })
  $('invOnlyNeedFill').addEventListener('change', () => { resetInvoiceView(); syncStatFilterState(); refreshLedger() })
  $('invSort').addEventListener('change', () => { resetInvoiceView(); refreshLedger() })

  // 分页：换页不清选中，跨页勾选要能一起批量操作
  $('pagerFirst').addEventListener('click', () => goInvoicePage(1))
  $('pagerPrev').addEventListener('click', () => goInvoicePage((invoiceData && invoiceData.page ? invoiceData.page : invoicePage) - 1))
  $('pagerNext').addEventListener('click', () => goInvoicePage((invoiceData && invoiceData.page ? invoiceData.page : invoicePage) + 1))
  $('pagerLast').addEventListener('click', () => goInvoicePage(invoiceData ? invoiceData.page_count : 1))

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
    // 浮层开着时 Esc 在输入框上就被 suggest.js 吃掉了，到不了这里；
    // 能到这里的 Esc 才是「关弹窗」。两个表单不会同时开，先后顺序无所谓的。
    if (event.key === 'Escape') {
      if (!$('batchReimburserModal').hidden) return requestCloseBatchReimburser()
      if (!$('invoiceEditModal').hidden) return requestCloseEdit()
      return
    }
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
        resetInvoiceView()
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
    if (event.target.closest('#closeEditBtn') || event.target.closest('#cancelEditBtn')) return requestCloseEdit()
    if (event.target.closest('#confirmBatchReimburserBtn')) return confirmBatchReimburser()
    if (event.target.closest('#closeBatchReimburserBtn') || event.target.closest('#cancelBatchReimburserBtn')) {
      return requestCloseBatchReimburser()
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
    if (event.target.closest('#invoiceImportBtn')) {
      $('invoiceImportFile').value = ''
      $('invoiceImportFile').click()
      return
    }
    if (event.target.closest('#invoicePasteBtn')) { openPasteImport(); return }
    if (event.target.closest('#closePasteBtn') || event.target.closest('#cancelPasteBtn')) { closePasteImport(); return }
    if (event.target.closest('#confirmPasteBtn')) { previewPasteImport(); return }
    if (event.target.closest('#confirmImportBtn')) { confirmImport(); return }
    if (event.target.closest('#importAllBtn')) { importAllIncludingDuplicates(); return }
    if (event.target.closest('[data-action="only-duplicates"]')) { toggleImportOnly('duplicate'); return }
    if (event.target.closest('[data-action="only-number-warnings"]')) { toggleImportOnly('number'); return }
    if (event.target.closest('#cancelImportBtn')) {
      pendingImportFile = null
      pendingImportPreview = null
      importOnly = ''
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
    if (event.target.id === 'invoiceEditModal') requestCloseEdit()
  })

  $('batchReimburserModal').addEventListener('click', (event) => {
    if (event.target.id === 'batchReimburserModal') requestCloseBatchReimburser()
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
