let statusData = null
let filesData = null
let uploadItems = []

async function refresh() {
  try {
    const [status, files] = await Promise.all([
      requestJSON('/api/status'),
      requestJSON('/api/files')
    ])
    statusData = status
    filesData = files
    renderAll()
  } catch (error) {
    $('serviceState').textContent = '服务异常'
    $('serviceState').className = 'stat-value bad'
    $('serviceDetail').textContent = error.message
  }
}

function renderAll() {
  if (!statusData || !filesData) return

  renderStatus(statusData)
  renderAddresses(statusData)
  renderDevices((statusData.mini_program && statusData.mini_program.devices) || [])

  const keyword = ($('searchInput').value || '').trim().toLowerCase()
  renderIncoming(filesData.incoming || [], keyword)
  renderOutgoing(filesData.outgoing || [], keyword)
  renderEvents(statusData.events || [])
}

/**
 * index 是 uploadItems 的下标（0 起），由 postFiles 按文件顺序给出。
 * 越界直接忽略：宁可少一行进度，也不要因为下标算错在界面上留一排空洞。
 */
function setUploadItem(index, name, percent, state) {
  if (index < 0 || index >= uploadItems.length) return
  uploadItems[index] = { name, percent, state }
  renderUploadProgress(uploadItems)
}

async function handleUpload(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return

  uploadItems = files.map((file) => ({ name: file.name, percent: 0, state: '等待' }))
  renderUploadProgress(uploadItems)

  try {
    // 送进待取区等小程序来取，不是传到这台电脑自己这里
    await postFiles('/api/files/outgoing', files, {}, setUploadItem)
    await refresh()
  } catch (error) {
    const last = uploadItems[uploadItems.length - 1]
    if (last) {
      last.state = '失败：' + error.message
      renderUploadProgress(uploadItems)
    }
  }
  $('fileInput').value = ''
}

async function handleDelete(button) {
  const kind = button.dataset.kind
  const label = kind === 'incoming' ? button.dataset.id : button.dataset.name
  if (!confirm('确定删除「' + label + '」？删除后不可恢复。')) return

  const path = kind === 'incoming'
    ? '/api/incoming/' + encodeURIComponent(button.dataset.id)
    : '/api/outgoing/' + encodeURIComponent(button.dataset.name)

  try {
    await deleteJSON(path)
    await refresh()
  } catch (error) {
    alert('删除失败：' + error.message)
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return
    }
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  } catch (error) {
    prompt('手动复制这个地址：', text)
  }
}

function switchTab(name) {
  const showConsole = name === 'console'
  $('pageConsole').hidden = !showConsole
  $('pageLedger').hidden = showConsole
  $('tabConsole').classList.toggle('active', showConsole)
  $('tabLedger').classList.toggle('active', !showConsole)

  if (showConsole) refresh()
  else if (window.refreshLedger) window.refreshLedger()
}

function bindEvents() {
  $('refreshBtn').addEventListener('click', refresh)
  $('tabConsole').addEventListener('click', () => switchTab('console'))
  $('tabLedger').addEventListener('click', () => switchTab('ledger'))
  $('chooseBtn').addEventListener('click', () => $('fileInput').click())
  $('fileInput').addEventListener('change', (event) => handleUpload(event.target.files))
  $('searchInput').addEventListener('input', renderAll)

  const dropZone = $('dropZone')
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault()
    dropZone.classList.add('over')
  })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'))
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault()
    dropZone.classList.remove('over')
    handleUpload(event.dataTransfer.files)
  })

  document.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.delete-btn')
    if (deleteButton) {
      handleDelete(deleteButton)
      return
    }
    const copyButton = event.target.closest('.copy-btn')
    if (copyButton) copyText(copyButton.dataset.url)
  })
}

bindEvents()
refresh()

// 轮询间隔跟着状态走：还没连上时用户正盯着「小程序连接」这张卡，2 秒一次；
// 连上之后没必要这么勤，回到 5 秒。
const POLL_FAST_MS = 2000
const POLL_IDLE_MS = 5000
let pollTimer = null

function nextPollDelay() {
  const mini = statusData && statusData.mini_program
  return mini && mini.online ? POLL_IDLE_MS : POLL_FAST_MS
}

function scheduleRefresh() {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    await refresh()
    scheduleRefresh()
  }, nextPollDelay())
}

scheduleRefresh()

// 切回这个标签页时立刻刷新一次，别让用户等下一个轮询
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return
  refresh().then(scheduleRefresh)
})
