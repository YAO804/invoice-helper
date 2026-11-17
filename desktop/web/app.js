const $ = (id) => document.getElementById(id)

async function requestJSON(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || response.statusText)
  return data
}

async function refreshHealth() {
  try {
    const data = await requestJSON('/api/health')
    $('health').textContent = `服务正常 · ${data.name} · v${data.version}`
    $('health').className = 'status ok'
  } catch (error) {
    $('health').textContent = '服务异常：' + error.message
    $('health').className = 'status bad'
  }
}

async function refreshFiles() {
  try {
    const data = await requestJSON('/api/files')
    renderIncoming(data.incoming || [])
    renderOutgoing(data.outgoing || [])
  } catch (error) {
    $('uploadResult').textContent = '读取文件列表失败：' + error.message
  }
}

function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch])
}

function human(size) {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / 1024 / 1024).toFixed(2) + ' MB'
}

function emptyRow(text, colspan) {
  return `<tr><td colspan="${colspan}" class="empty">${text}</td></tr>`
}

function renderIncoming(list) {
  if (!list.length) {
    $('incomingBody').innerHTML = emptyRow('暂无上传文件', 5)
    return
  }

  $('incomingBody').innerHTML = list.map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${human(item.size)}</td>
      <td>${esc(item.source)}</td>
      <td>${esc(item.uploaded_at)}</td>
      <td><a href="/api/incoming/${encodeURIComponent(item.id)}/download">下载</a></td>
    </tr>
  `).join('')
}

function renderOutgoing(list) {
  if (!list.length) {
    $('outgoingBody').innerHTML = emptyRow('暂无待取文件', 4)
    return
  }

  $('outgoingBody').innerHTML = list.map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${human(item.size)}</td>
      <td>${esc(item.modified_at)}</td>
      <td><a href="/api/outgoing/${encodeURIComponent(item.name)}/download">下载</a></td>
    </tr>
  `).join('')
}

async function upload(event) {
  event.preventDefault()
  const file = $('fileInput').files[0]
  if (!file) return

  $('uploadResult').textContent = '上传中...'
  const form = new FormData()
  form.append('file', file)
  form.append('source', $('sourceInput').value || 'web')

  try {
    const record = await requestJSON('/api/files/upload', { method: 'POST', body: form })
    $('uploadResult').textContent = record.duplicate
      ? '文件内容已存在，未重复保存：' + record.name
      : '已上传：' + record.name
    $('fileInput').value = ''
    await refreshFiles()
  } catch (error) {
    $('uploadResult').textContent = '上传失败：' + error.message
  }
}

$('uploadForm').addEventListener('submit', upload)
$('refreshBtn').addEventListener('click', () => {
  refreshHealth()
  refreshFiles()
})

refreshHealth()
refreshFiles()
