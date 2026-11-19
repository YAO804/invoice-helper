/**
 * 最近事件的类型标签测试。
 *
 * 重点是一条跨端约定：事件类型在协议里是英文（upload / put / delete / import），
 * 界面必须显示中文。后端新增一种事件类型而前端忘了配中文时，
 * 界面上就会突然冒出一个英文单词——这个测试会直接挂。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '../..')
const WEB = path.join(ROOT, 'desktop/web')

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

const elements = {}
function el(id) {
  if (!elements[id]) elements[id] = { id, innerHTML: '', textContent: '', hidden: true }
  return elements[id]
}
global.document = { getElementById: el, addEventListener() {} }

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(WEB, file), 'utf8'), { filename: file })
}

load('time.js')
load('render.js')
load('events.js')

/** 从 Go 源码里把所有事件类型捞出来，作为「界面必须认识」的清单 */
function backendKinds() {
  const kinds = new Set()
  const dir = path.join(ROOT, 'desktop')
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    if (!file.endsWith('.go') || file.endsWith('_test.go')) continue
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const match of source.matchAll(/MarkEvent\("([a-z]+)"/g)) kinds.add(match[1])
  }
  return [...kinds].sort()
}

const labels = JSON.parse(vm.runInThisContext('JSON.stringify(EVENT_LABELS)'))

/* 1. 后端每个事件类型都必须有中文标签 */
const kinds = backendKinds()
check('扫到后端的全部事件类型', kinds, ['delete', 'import', 'put', 'upload'])
check('后端事件类型都有中文标签', kinds.filter((kind) => !labels[kind]), [])

/* 2. 标签里不能出现英文字母 */
check('标签不含英文', Object.values(labels).filter((text) => /[A-Za-z]/.test(text)), [])

/* 3. 未知类型兜底成中文，不把英文漏到界面 */
check('未知类型兜底', vm.runInThisContext('eventLabel("unknown_kind")'), '其它')
check('空类型兜底', vm.runInThisContext('eventLabel("")'), '其它')

/* 4. class 名只取小写字母，异常值退回 other */
check('正常类型作为 class', vm.runInThisContext('eventClass("upload")'), 'upload')
check('带引号的类型不进 class', vm.runInThisContext('eventClass(\'a"b\')'), 'other')
check('大写类型不进 class', vm.runInThisContext('eventClass("UPLOAD")'), 'other')

/* 5. 渲染结果用中文，且保留原始类型供排查 */
const list = [
  { kind: 'upload', text: '收到文件 a.jpg', at: '2026-11-18T02:20:00Z' },
  { kind: 'put', text: '加入待取文件 通用引脚定义.png', at: '2026-11-18T02:19:00Z' },
  { kind: 'delete', text: '删除发票 1 张', at: '2026-11-18T02:18:00Z' },
  { kind: 'import', text: '补录发票 00813247', at: '2026-11-18T02:17:00Z' },
  { kind: 'mystery', text: '未知操作', at: '2026-11-18T02:16:00Z' }
]
el('eventList').innerHTML = ''
vm.runInThisContext('renderEvents(' + JSON.stringify(list) + ')')
const html = el('eventList').innerHTML

check('界面显示「接收」', html.includes('>接收<'), true)
check('界面显示「发送」', html.includes('>发送<'), true)
check('界面显示「删除」', html.includes('>删除<'), true)
check('界面显示「台账」', html.includes('>台账<'), true)
check('未知类型显示「其它」', html.includes('>其它<'), true)

for (const kind of ['upload', 'put', 'delete', 'import']) {
  check('不把 ' + kind + ' 当文字显示', html.includes('>' + kind + '<'), false)
}
check('原始类型保留在 title 里', html.includes('title="upload"'), true)

/* 6. 时间统一按北京时间显示，不再把带 Z 的 UTC 串贴到界面 */
check('事件时间换成北京时间', html.includes('2026-11-18 10:20:00'), true)
check('界面不出现带 Z 的原始串', /T\d{2}:\d{2}:\d{2}Z/.test(html), false)
check('样式 class 仍是原始类型', html.includes('class="event-kind upload"'), true)

/* 6. 文本转义，事件内容里有尖括号也不能当标签 */
el('eventList').innerHTML = ''
vm.runInThisContext('renderEvents([{kind:"upload",text:"<script>x</script>",at:"now"}])')
check('事件文本被转义', el('eventList').innerHTML.includes('&lt;script&gt;'), true)

/* 7. 空列表给提示，不要留一片空白 */
el('eventList').innerHTML = ''
vm.runInThisContext('renderEvents([])')
check('空列表给出提示', el('eventList').innerHTML, '<p class="empty">暂无事件</p>')

/* 8. 最多显示 12 条，避免长列表把侧栏撑爆 */
const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'import', text: '事件 ' + i, at: 'now' }))
el('eventList').innerHTML = ''
vm.runInThisContext('renderEvents(' + JSON.stringify(many) + ')')
check('只渲染前 12 条', (el('eventList').innerHTML.match(/event-row/g) || []).length, 12)

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
if (fail) process.exitCode = 1
