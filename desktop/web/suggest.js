/**
 * 输入框的历史值下拉：自己画浮层，不用浏览器原生 datalist。
 *
 * 原生 datalist 的弹出层由浏览器决定字号、行高、圆角、最大高度，
 * 跟页面其它控件完全不是一个风格（截图里那坨大字号白框能盖住半屏），
 * 也没法限制条数。这里改成页面内浮层：跟着输入框定位、同一套字号与圆角、
 * 最多 8 条、超出滚动，键盘上下 + 回车可选。
 *
 * 浮层挂在 body 上而不是输入框旁边：输入框可能在弹窗里、在可滚动的表格里，
 * 挂在内部会被 overflow 裁掉。
 */

const SUGGEST_MAX = 8
const SUGGEST_GAP = 4
/** 底部「还有多少」提示里的量词：数字带量词才像中文 */
const SUGGEST_UNITS = { reimburser: '位报销人', kind: '种票种' }

/** 建议值按用途分开放；台账刷新时整体替换，不随当前筛选结果漂移 */
const suggestStore = { reimburser: [], kind: [] }
/** 本次会话刚填过的值，下次展开置顶（连续补录同一个人时不用每次往下翻） */
const suggestRecent = { reimburser: [], kind: [] }

let suggestPanel = null
let suggestItems = []
let suggestTotal = 0
let suggestActive = -1
let suggestOwner = null
let suggestKey = ''
let suggestFilter = false   // 打字才按输入内容过滤；单纯点进来应该看到全部历史值
let suggestPicking = false  // 正在回填选中值，别把这次赋值当成「用户又在打字」
let suggestHeld = false     // 鼠标按在浮层上（含拖滚动条）：输入框会失焦，但浮层不能收

/** 台账数据变化后刷新某一类建议 */
function setSuggestValues(key, values) {
  suggestStore[key] = (values || []).map((value) => String(value).trim()).filter(Boolean)
  if (suggestOwner && suggestKey === key) renderSuggestList(suggestOwner)
}

/**
 * 记下刚填过的值，下一次展开时置顶。
 * 一批票往往是同一两个报销人，连着填时不置顶就得每次进浮层往下翻。
 */
function markSuggestRecent(key, value) {
  const text = String(value || '').trim()
  if (!text || !suggestRecent[key]) return
  const list = suggestRecent[key]
  const at = list.indexOf(text)
  if (at >= 0) list.splice(at, 1)
  list.unshift(text)
  if (list.length > SUGGEST_MAX) list.length = SUGGEST_MAX
}

/**
 * 全部候选（未截断）：保持传入顺序（台账那边已按使用次数排好），
 * 再把本次会话用过的提到最前。总数要留着给底部提示用，所以不能先截断。
 */
function suggestCandidates(input) {
  const word = suggestFilter ? String((input && input.value) || '').trim().toLowerCase() : ''
  const all = suggestStore[suggestKey] || []
  const hit = word ? all.filter((value) => value.toLowerCase().indexOf(word) >= 0) : all
  const recent = (suggestRecent[suggestKey] || []).filter((value) => hit.indexOf(value) >= 0)
  if (!recent.length) return hit
  return recent.concat(hit.filter((value) => recent.indexOf(value) < 0))
}

function ensureSuggestPanel() {
  if (suggestPanel) return suggestPanel

  suggestPanel = document.createElement('div')
  suggestPanel.className = 'suggest-panel'
  suggestPanel.setAttribute('role', 'listbox')
  suggestPanel.hidden = true
  document.body.appendChild(suggestPanel)

  // 用 pointerdown 抢在输入框 blur 之前选中：输入框不会先失焦，
  // 行内编辑的「失焦即保存」也就不会把半截输入存下去。
  suggestPanel.addEventListener('pointerdown', (event) => {
    // 按在浮层任意位置都先记一笔：拖滚动条、点空白都会让输入框失焦，
    // 失焦后 120ms 收起会把浮层连同滚动条一起收掉，看着就是「滑块拖不动」
    suggestHeld = true
    const item = event.target.closest('.suggest-item')
    if (!item) return
    event.preventDefault()
    pickSuggest(item.dataset.value)
  })
  // 松手就解除，之后点别处仍按正常逻辑收起
  document.addEventListener('pointerup', () => { suggestHeld = false }, true)

  window.addEventListener('resize', closeSuggest)
  // 表格/弹窗一滚动浮层就会跟输入框错位，直接收起比跟着飘更省事。
  // 但浮层自己滚动（历史值超过 8 条、列表超高的那种）不算——scroll 不冒泡，
  // 却在捕获阶段经过 document，不排除掉的话一拖滚动条就把浮层收没了。
  document.addEventListener('scroll', (event) => {
    if (suggestPanel && suggestPanel.contains(event.target)) return
    closeSuggest()
  }, true)
  document.addEventListener('pointerdown', (event) => {
    if (!suggestPanel || suggestPanel.hidden) return
    if (suggestPanel.contains(event.target) || event.target === suggestOwner) return
    closeSuggest()
  }, true)

  return suggestPanel
}

function renderSuggestList(input) {
  const panel = ensureSuggestPanel()
  const candidates = suggestCandidates(input)
  suggestTotal = candidates.length
  suggestItems = candidates.slice(0, SUGGEST_MAX)
  suggestActive = -1
  if (!suggestItems.length) {
    closeSuggest()
    return
  }
  panel.innerHTML = suggestItems.map(suggestItemHtml).join('') + suggestMoreHtml()
  panel.hidden = false
  placeSuggestPanel(input)
}

function suggestItemHtml(value) {
  return `<button type="button" class="suggest-item" role="option" data-value="${esc(value)}">${esc(value)}</button>`
}

/**
 * 底部提示：还有没显示出来的才写。
 * 只有 8 条以内时不写——否则「共 5 位」贴着最后一行，看着像还有下文。
 */
function suggestMoreHtml() {
  if (suggestTotal <= suggestItems.length) return ''
  const unit = SUGGEST_UNITS[suggestKey] || '项'
  return `<div class="suggest-more">共 ${suggestTotal} ${unit} · 继续输入可筛选</div>`
}

function placeSuggestPanel(input) {
  const rect = input.getBoundingClientRect()
  const panel = suggestPanel
  panel.style.width = Math.round(rect.width) + 'px'
  panel.style.left = Math.round(rect.left) + 'px'
  panel.style.top = Math.round(rect.bottom + SUGGEST_GAP) + 'px'
  // 下面放不下就翻到输入框上方，别把浮层顶出视口
  const height = panel.offsetHeight
  if (height && rect.bottom + SUGGEST_GAP + height > window.innerHeight - 8) {
    panel.style.top = Math.max(8, Math.round(rect.top - SUGGEST_GAP - height)) + 'px'
  }
}

function showSuggest(input, key, filter) {
  suggestOwner = input
  suggestKey = key
  suggestFilter = !!filter
  renderSuggestList(input)
}

function closeSuggest() {
  if (suggestPanel) suggestPanel.hidden = true
  suggestItems = []
  suggestTotal = 0
  suggestActive = -1
  suggestOwner = null
  suggestKey = ''
  suggestHeld = false
}

/** 浮层里除选项外还有底部提示，高亮下标只能数选项本身 */
function suggestItemNodes() {
  return Array.prototype.filter.call(suggestPanel.children, (node) =>
    node.classList && node.classList.contains('suggest-item'))
}

function markActive() {
  if (!suggestPanel) return
  suggestItemNodes().forEach((item, index) => {
    const active = index === suggestActive
    item.classList.toggle('active', active)
    // 列表最高 280px，偶尔仍装不下。键盘往下走到看不见的项要跟着滚，
    // 否则高亮移到了视口外，屏幕上没变化，用户会以为方向键坏了。
    if (active && item.scrollIntoView) item.scrollIntoView({ block: 'nearest' })
  })
}

function pickSuggest(value) {
  const input = suggestOwner
  if (!input) return
  input.value = value
  markSuggestRecent(suggestKey, value)
  closeSuggest()
  // 补发 input/change：行内编辑靠 change 直接落库（与原生 datalist 选值的行为一致），
  // 否则用户选完以为存了，其实还在等回车。
  if (typeof Event === 'function' && typeof input.dispatchEvent === 'function') {
    suggestPicking = true
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } finally {
      suggestPicking = false
    }
  }
  input.focus()
}

function suggestKeydown(event, input, key) {
  const panelOpen = suggestPanel && !suggestPanel.hidden

  if (event.key === 'Escape' && panelOpen) {
    // 只收浮层：同元素上行内编辑的 Esc=取消编辑 必须被拦住，
    // 用户按第二下才轮到它
    event.stopImmediatePropagation()
    closeSuggest()
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!panelOpen) {
      showSuggest(input, key, false)
      return
    }
    event.preventDefault()
    const total = suggestItems.length
    if (!total) return
    const step = event.key === 'ArrowDown' ? 1 : -1
    suggestActive = (suggestActive + step + total) % total
    markActive()
    return
  }

  if (event.key === 'Enter' && panelOpen && suggestActive >= 0) {
    // 收起浮层并吃掉这次回车：不要顺手把弹窗里的「保存」也触发了
    event.preventDefault()
    event.stopImmediatePropagation()
    pickSuggest(suggestItems[suggestActive])
  }
}

/** 把某个输入框接上建议浮层：key 决定用哪一组历史值 */
function attachSuggest(input, key) {
  if (!input) return
  input.setAttribute('autocomplete', 'off')
  input.removeAttribute('list')
  input.addEventListener('focus', () => showSuggest(input, key, false))
  input.addEventListener('click', () => showSuggest(input, key, false))
  input.addEventListener('input', () => {
    if (suggestPicking) return
    showSuggest(input, key, true)
  })
  input.addEventListener('keydown', (event) => suggestKeydown(event, input, key))
  // 失焦后等一下再收：否则点浮层里的选项时浮层先消失，点了个寂寞；
  // 正按着浮层（拖滚动条）更不能收，那时输入框必然已经失焦
  input.addEventListener('blur', () => setTimeout(() => {
    if (!suggestHeld) closeSuggest()
  }, 120))
}
