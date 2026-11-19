const $ = (id) => document.getElementById(id)

function esc(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch])
}

function human(size) {
  if (!size) return '0 B'
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / 1024 / 1024).toFixed(2) + ' MB'
}

function duration(seconds) {
  if (seconds < 60) return seconds + ' 秒'
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟'
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时'
  return Math.floor(seconds / 86400) + ' 天'
}

function timeAgo(seconds) {
  if (seconds === undefined || seconds === null || seconds < 0) return '未知'
  if (seconds < 5) return '刚刚'
  if (seconds < 60) return seconds + ' 秒前'
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前'
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前'
  return Math.floor(seconds / 86400) + ' 天前'
}

function emptyRow(text, colspan) {
  return `<tr><td colspan="${colspan}" class="empty">${text}</td></tr>`
}

function renderStatus(data) {
  const service = data.service || {}
  const mini = data.mini_program || {}
  const stats = data.stats || {}

  $('serviceState').textContent = service.ok ? '运行中' : '异常'
  $('serviceState').className = 'stat-value ok'
  $('serviceDetail').textContent = `v${service.version || '-'} · 已运行 ${duration(service.uptime_sec || 0)}`

  $('miniState').textContent = mini.online ? '小程序在线' : '小程序离线'
  $('miniState').className = 'stat-value ' + (mini.online ? 'ok' : 'warn')
  $('miniDetail').textContent = mini.last_seen
    ? `最近心跳 ${timeAgo(mini.seconds_ago)} · ${(mini.devices || []).length} 台设备`
    : '尚未收到小程序心跳'

  $('todayCount').textContent = stats.today_count || 0
  $('todayBytes').textContent = human(stats.today_bytes)
  $('outgoingCount').textContent = stats.outgoing_count || 0
  $('outgoingBytes').textContent = human(stats.outgoing_bytes)
  $('lastRefresh').textContent = '更新于 ' + beijingClock()
}

function renderAddresses(data) {
  const addresses = (data.network && data.network.addresses) || []
  renderConnect(data.network || {})

  if (!addresses.length) {
    $('addressList').innerHTML = '<p class="hint">未检测到局域网地址，请检查网络连接。</p>'
    return
  }

  $('addressList').innerHTML = addresses.map((item) => `
    <div class="address-row">
      <div>
        <div class="address-label">${esc(item.interface)} · ${esc(item.ip)}</div>
        <code>${esc(item.url)}</code>
      </div>
      <button type="button" class="secondary copy-btn" data-url="${esc(item.url)}">复制</button>
    </div>
  `).join('')
}

/** 二维码只在首选地址变化时重新拉取，避免 5 秒轮询每次都重新生成图片 */
function renderConnect(network) {
  const url = network.primary_url || ''
  const box = $('connectBox')
  if (!url) {
    box.hidden = true
    return
  }

  box.hidden = false
  $('connectCode').textContent = network.connect_code || url

  const img = $('connectQr')
  if (img.dataset.url !== url) {
    img.dataset.url = url
    img.src = '/api/connect-qr.png?t=' + Date.now()
  }
}

function renderDevices(list) {
  if (!list.length) {
    $('deviceBody').innerHTML = emptyRow('暂无设备连接记录', 5)
    return
  }

  $('deviceBody').innerHTML = list.map((item) => `
    <tr>
      <td>${esc(item.name)}<div class="muted tiny">${esc(item.id)}</div></td>
      <td>${esc(item.version || '-')}</td>
      <td>${timeAgo(item.seconds_ago)}</td>
      <td>${item.uploads || 0}</td>
      <td><span class="pill ${item.online ? 'online' : 'offline'}">${item.online ? '在线' : '离线'}</span></td>
    </tr>
  `).join('')
}

function matches(item, keyword) {
  if (!keyword) return true
  return [item.name, item.source, item.id].some((value) => String(value || '').toLowerCase().includes(keyword))
}

/**
 * 文件名做成按钮：能预览的点开弹层，不能预览的点一下提示下载。
 * 两种都保留按钮，用户不会因为"这个名字是灰的、点不动"而以为页面坏了。
 */
function fileNameCell(item) {
  const hint = item.preview ? '点击预览' : '这种格式浏览器打不开，点击提示下载'
  const cls = item.preview ? 'link preview-btn' : 'link preview-btn muted-link'
  return `<button type="button" class="${cls}" data-preview-id="${esc(item.id)}" title="${hint}">${esc(item.name)}</button>` +
    `<div class="muted tiny">${esc(item.sha256 || '')}</div>`
}

function renderIncoming(list, keyword) {
  const rows = list.filter((item) => matches(item, keyword))
  if (!rows.length) {
    $('incomingBody').innerHTML = emptyRow('暂无上传文件', 5)
    return
  }

  $('incomingBody').innerHTML = rows.map((item) => `
    <tr>
      <td>${fileNameCell(item)}</td>
      <td>${human(item.size)}</td>
      <td>${esc(item.source)}</td>
      <td>${esc(beijingTime(item.uploaded_at))}</td>
      <td>
        <a href="/api/incoming/${encodeURIComponent(item.id)}/download">下载</a>
        <button type="button" class="link danger delete-btn" data-kind="incoming" data-id="${esc(item.id)}">删除</button>
      </td>
    </tr>
  `).join('')
}

function renderOutgoing(list, keyword) {
  const rows = list.filter((item) => matches(item, keyword))
  if (!rows.length) {
    $('outgoingBody').innerHTML = emptyRow('暂无待取文件', 4)
    return
  }

  $('outgoingBody').innerHTML = rows.map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${human(item.size)}</td>
      <td>${esc(beijingTime(item.modified_at))}</td>
      <td>
        <a href="/api/outgoing/${encodeURIComponent(item.name)}/download">下载</a>
        <button type="button" class="link danger delete-btn" data-kind="outgoing" data-name="${esc(item.name)}">删除</button>
      </td>
    </tr>
  `).join('')
}

function renderUploadProgress(items) {
  $('uploadProgress').innerHTML = items.map((item) => `
    <div class="progress-row">
      <span class="progress-name">${esc(item.name)}</span>
      <span class="progress-track"><i style="width:${item.percent}%"></i></span>
      <span class="progress-text">${item.state} ${item.percent}%</span>
    </div>
  `).join('')
}
