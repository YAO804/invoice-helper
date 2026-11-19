/**
 * 历史值下拉浮层（suggest.js）：替代原生 datalist 后的交互回归。
 *
 * 原生 datalist 的样式没法改，这里是页面内浮层，行为得自己守住：
 * 点开有值、输入会过滤、键盘能选、Esc 能收、没匹配就别弹空框。
 *
 *   node test/desktop/suggest.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')

let pass = 0
let fail = 0

function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log('PASS ' + name)
    return
  }
  fail++
  console.log('FAIL ' + name)
  console.log('  实际: ' + a)
  console.log('  期望: ' + e)
}

/* 极简可控 DOM：只实现 suggest.js 用到的接口 */
function makeNode(tag) {
  const listeners = {}
  const node = {
    tagName: tag,
    className: '',
    innerHTML: '',
    hidden: true,
    value: '',
    offsetHeight: 120,
    dataset: {},
    style: {},
    attrs: {},
    children: [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn) },
    dispatch(type, event) {
      (listeners[type] || []).forEach((fn) => fn(event))
    },
    setAttribute(key, value) { node.attrs[key] = value },
    removeAttribute(key) { delete node.attrs[key] },
    getBoundingClientRect() {
      return { top: 100, bottom: 130, left: 200, width: 240, height: 30 }
    },
    contains(target) { return target === node },
    closest() { return null },
    appendChild(child) { node.children.push(child); return child },
    dispatchEvent(event) { node.dispatch(event.type, event) },
    focus() { node.focused = true },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false } }
  }
  return node
}

const body = makeNode('body')
const created = []
const docListeners = {}
global.document = {
  body,
  createElement(tag) {
    const node = makeNode(tag)
    created.push(node)
    return node
  },
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn) }
}
/** 模拟文档上的 scroll（捕获阶段）：target 是谁决定浮层收不收 */
function fireScroll(target) {
  (docListeners.scroll || []).forEach((fn) => fn({ target }))
}
/** 模拟松开鼠标（捕获阶段），解除「正按着浮层」的锁定 */
function firePointerUp() {
  (docListeners.pointerup || []).forEach((fn) => fn({}))
}
global.window = { innerHeight: 800, addEventListener() {} }
global.Event = class { constructor(type) { this.type = type } }
global.esc = function (value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => map[ch])
}

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })

function keyEvent(key) {
  return {
    key,
    stopped: false,
    prevented: false,
    stopPropagation() { this.stopped = true },
    stopImmediatePropagation() { this.stopped = true },
    preventDefault() { this.prevented = true }
  }
}

const input = makeNode('input')
attachSuggest(input, 'reimburser')
setSuggestValues('reimburser', ['蔡文姬', '蔡以', '蔡以地方', '嘎', '张三'])

console.log('--- 打开与过滤 ---')
input.dispatch('focus')
const panel = body.children[0]
check('浮层挂到 body 上（不被弹窗裁切）', !!panel, true)
check('展开后可见', panel.hidden, false)
check('空输入列全部', panel.innerHTML.indexOf('蔡文姬') >= 0, true)
check('浮层带页面内样式类', panel.className, 'suggest-panel')
check('聚焦即展开（带着已有值也列全部历史）', panel.innerHTML.indexOf('张三') >= 0, true)

input.value = '蔡'
input.dispatch('input')
check('输入过滤只留匹配项', panel.innerHTML.indexOf('张三'), -1)
check('匹配项都在', ['蔡文姬', '蔡以', '蔡以地方'].every((v) => panel.innerHTML.indexOf(v) >= 0), true)

input.value = '蔡以地'
input.dispatch('input')
check('多字也能匹配', panel.innerHTML.indexOf('蔡以地方') >= 0, true)
check('不匹配的被过滤', panel.innerHTML.indexOf('蔡文姬'), -1)

input.value = '不存在的人'
input.dispatch('input')
check('没有匹配就收起', panel.hidden, true)

console.log('\n--- 选值后的副作用 ---')
let changes = 0
input.addEventListener('change', () => { changes++ })

console.log('\n--- 键盘选择 ---')
input.value = ''
input.dispatch('input')
check('清空后重新展开', panel.hidden, false)
let event = keyEvent('ArrowDown')
input.dispatch('keydown', event)
check('方向键被接管（不移动光标）', event.prevented, true)
event = keyEvent('Enter')
input.dispatch('keydown', event)
check('回车选中第一条', input.value, '蔡文姬')
check('选完收起浮层', panel.hidden, true)
check('选完补发 change（行内编辑可直接落库）', changes, 1)
check('回车事件被吃掉', event.prevented, true)

input.dispatch('focus')
input.dispatch('keydown', keyEvent('ArrowDown'))
input.dispatch('keydown', keyEvent('ArrowDown'))
input.dispatch('keydown', keyEvent('Enter'))
check('再按一次往下一项', input.value, '蔡以')

console.log('\n--- Esc 只收浮层 ---')
input.dispatch('focus')
event = keyEvent('Escape')
input.dispatch('keydown', event)
check('Esc 收起浮层', panel.hidden, true)
check('Esc 不冒泡给行内编辑（不当成取消编辑）', event.stopped, true)

console.log('\n--- 上限与刷新 ---')
setSuggestValues('reimburser', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'])
input.value = ''
input.dispatch('focus')
check('最多 8 条', suggestItems.length, 8)
check('第 9 条不渲染', panel.innerHTML.indexOf('A9'), -1)

console.log('\n--- 总数提示 ---')
// 只剩 8 条可见时用户会以为「系统里就这几个人」，所以要告诉他还有多少
check('超过 8 条时写出总数', panel.innerHTML.indexOf('共 10 位报销人') >= 0, true)
check('提示告诉用户可以继续输入', panel.innerHTML.indexOf('继续输入可筛选') >= 0, true)
check('总数是全量而不是截断后的 8', suggestTotal, 10)
input.value = 'A1'
input.dispatch('input')
check('过滤后总数跟着匹配数走', suggestTotal, 2)
check('匹配只剩 2 条就不写提示', panel.innerHTML.indexOf('suggest-more'), -1)

input.value = ''
setSuggestValues('reimburser', ['只有我'])
check('数据刷新后已展开的浮层同步', panel.innerHTML.indexOf('只有我') >= 0, true)
check('旧值被替换', panel.innerHTML.indexOf('A1'), -1)
check('8 条以内外不写总数（免得像还有下文）', panel.innerHTML.indexOf('suggest-more'), -1)

console.log('\n--- 最近用过的置顶 ---')
setSuggestValues('reimburser', ['张三', '李四', '王五'])
input.value = ''
input.dispatch('focus')
check('默认保持传入顺序（台账已按次数排好）', suggestItems, ['张三', '李四', '王五'])
// 一批票常常是同一两个人，连着填时刚填过的应该排在第一个
markSuggestRecent('reimburser', '王五')
input.dispatch('focus')
check('刚填过的置顶', suggestItems, ['王五', '张三', '李四'])
markSuggestRecent('reimburser', '李四')
input.dispatch('focus')
check('再填一个，最近的两个按倒序在前', suggestItems, ['李四', '王五', '张三'])
check('没有重复项', suggestItems.length, 3)
input.value = '张'
input.dispatch('input')
check('过滤时仍按最近优先', suggestItems, ['张三'])
input.value = ''
input.dispatch('focus')
check('清空输入后最近顺序还在', suggestItems[0], '李四')

console.log('\n--- 浮层自己滚动不能把浮层收掉 ---')
// scroll 不冒泡，但捕获阶段会经过 document；之前无条件 closeSuggest，
// 于是拖浮层自己的滚动条（或滚轮滚列表）浮层立刻消失，看起来就是「滑块拖不动」
setSuggestValues('reimburser', ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'])
input.value = ''
input.dispatch('focus')
check('先展开', panel.hidden, false)
fireScroll(panel)
check('浮层内部滚动（拖自己的滚动条）不收起', panel.hidden, false)
fireScroll(panel)
check('连续滚动仍然保持展开', panel.hidden, false)
fireScroll(makeNode('div'))
check('页面/弹窗滚动仍要收起（否则浮层跟输入框错位）', panel.hidden, true)

// 拖浮层自己的滚动条必然让输入框失焦，失焦后 120ms 收起同样会把浮层收掉
console.log('\n--- 按住浮层时失焦不收 ---')
input.dispatch('focus')
check('先展开', panel.hidden, false)
panel.dispatch('pointerdown', { target: panel, preventDefault() {} })
input.dispatch('blur')

setTimeout(function () {
  check('按在滚动条上失焦后浮层仍在', panel.hidden, false)
  firePointerUp()
  input.dispatch('blur')
  setTimeout(function () {
    check('松手后失焦恢复正常收起', panel.hidden, true)
    console.log('\n' + (pass + ' passed, ' + fail + ' failed'))
    process.exit(fail ? 1 : 0)
  }, 200)
}, 200)
