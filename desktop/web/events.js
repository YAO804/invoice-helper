/**
 * 最近事件的渲染。
 *
 * 事件类型在协议里是英文（upload / put / delete / import），那是两端的通信词汇，
 * 不该直接贴到界面上。这里做一层中文映射，同时保留原始类型供样式和排查使用。
 *
 * 新增事件类型时**必须**在这里补一条：test/desktop/events.test.js 会扫描
 * desktop/ 下所有 MarkEvent("...") 调用，缺少映射会直接报错。
 */

const EVENT_LABELS = {
  upload: '接收',
  put: '发送',
  delete: '删除',
  import: '台账'
}

/** 未知类型也要有中文，否则一升级界面又冒出英文单词 */
function eventLabel(kind) {
  return EVENT_LABELS[kind] || '其它'
}

/** class 名只允许小写字母，避免把后端字段原样拼进 DOM */
function eventClass(kind) {
  const text = String(kind || '')
  return /^[a-z]+$/.test(text) ? text : 'other'
}

function renderEvents(list) {
  if (!list.length) {
    $('eventList').innerHTML = '<p class="empty">暂无事件</p>'
    return
  }

  $('eventList').innerHTML = list.slice(0, 12).map((item) => `
    <div class="event-row">
      <span class="event-kind ${eventClass(item.kind)}" title="${esc(item.kind)}">${esc(eventLabel(item.kind))}</span>
      <span>${esc(item.text)}</span>
      <span class="muted tiny">${esc(item.at)}</span>
    </div>
  `).join('')
}
