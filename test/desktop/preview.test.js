/**
 * 预览弹层的前端回归测试。
 *
 * 这里不启动浏览器，只搭一层最小的 DOM 假件：`document.getElementById` 返回可记录事件的假元素。
 * 目的很明确——证明「文件名按钮渲染出来」和「点了能打开弹层」是两件事，必须都有测试。
 * 之前线上正是渲染了按钮但没人监听点击，静态读代码看不出来。
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

const elements = {}
const documentListeners = {}

function makeEl(id) {
  const el = {
    id,
    hidden: true,
    innerHTML: '',
    textContent: '',
    href: '',
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      ;(this.listeners[type] = this.listeners[type] || []).push(fn)
    },
    click() {
      ;(this.listeners.click || []).forEach((fn) => fn({ target: this }))
    },
    setAttribute(key, value) {
      this[key] = value
    }
  }
  return el
}

function el(id) {
  if (!elements[id]) elements[id] = makeEl(id)
  return elements[id]
}

global.document = {
  getElementById: el,
  addEventListener(type, fn) {
    ;(documentListeners[type] = documentListeners[type] || []).push(fn)
  }
}

const alerts = []
global.alert = (text) => alerts.push(text)
global.alertLog = alerts

let fetchBody = 'hello'
let fetchCalls = []
global.fetch = async (url) => {
  fetchCalls.push(url)
  return { ok: true, status: 200, text: async () => fetchBody }
}

function load(file) {
  const source = fs.readFileSync(path.join(WEB, file), 'utf8')
  vm.runInThisContext(source, { filename: file })
}

vm.runInThisContext('var filesData = null', { filename: 'fixture.js' })
load('time.js')
load('render.js')
load('preview.js')

/** 模拟点击某个文件名按钮：target.closest 只在选择器命中时返回按钮。 */
function clickName(id) {
  const target = {
    closest(selector) {
      return selector === '[data-preview-id]' ? { dataset: { previewId: id } } : null
    }
  }
  ;(documentListeners.click || []).forEach((fn) => fn({ target }))
}

/**
 * 只清字段、不重建元素：bindPreview() 在加载时就已经把监听器挂在了缓存对象上，
 * 换成新对象等于把监听器一起扔掉，测出来的「点了没反应」是测试自己的假象。
 */
function reset() {
  el('previewBody').innerHTML = ''
  el('previewTitle').textContent = ''
  el('previewHint').textContent = ''
  el('previewDownload').href = ''
  el('previewModal').hidden = true
  alerts.length = 0
  fetchCalls = []
}

const IMAGE = { id: 'a1', name: 'pic.jpg', size: 1024, preview: 'image' }
const PDF = { id: 'b2', name: '发票.pdf', size: 2048, preview: 'pdf' }
const TEXT = { id: 'c3', name: 'dzfp.xml', size: 100, preview: 'text' }
const ZIP = { id: 'd4', name: '打包.zip', size: 4096, preview: '' }

reset()
global.filesData = { incoming: [IMAGE, PDF, TEXT, ZIP], outgoing: [] }

/* 1. 事件委托确实挂上了 */
check('document 上注册了 click 委托', (documentListeners.click || []).length >= 1, true)

/* 2. 图片走 <img> 直显 */
clickName('a1')
check('图片：弹层打开', elements.previewModal.hidden, false)
check('图片：标题是文件名', elements.previewTitle.textContent, 'pic.jpg')
check('图片：用 img 渲染', elements.previewBody.innerHTML.includes('class="preview-image"'), true)
check('图片：预览地址走 /view', elements.previewBody.innerHTML.includes('/api/incoming/a1/view'), true)
check('图片：下载链接走 /download', elements.previewDownload.href, '/api/incoming/a1/download')
check('图片：不改 filesData', global.filesData.incoming.length, 4)

/* 3. PDF 走 iframe，交给浏览器内置阅读器 */
reset()
clickName('b2')
check('PDF：弹层打开', elements.previewModal.hidden, false)
check('PDF：用 iframe 渲染', elements.previewBody.innerHTML.includes('class="preview-frame"'), true)
check('PDF：提示提到内置阅读器', elements.previewHint.textContent.includes('浏览器内置阅读器'), true)

/* 4. HTML 转义：文件名带引号不能逃出属性 */
reset()
global.filesData = { incoming: [{ id: 'e5', name: 'a"b.pdf', size: 10, preview: 'pdf' }], outgoing: [] }
clickName('e5')
check('PDF：文件名引号被转义', elements.previewBody.innerHTML.includes('&quot;'), true)

/* 5. 不能预览的格式只提示，不打开弹层 */
reset()
global.filesData = { incoming: [ZIP], outgoing: [] }
clickName('d4')
check('ZIP：弹层保持关闭', elements.previewModal.hidden, true)
check('ZIP：给出下载提示', alerts.length, 1)
check('ZIP：提示里带文件名', alerts[0].includes('打包.zip'), true)

/* 6. 找不到的 id 静默返回，不弹错 */
reset()
clickName('不存在')
check('未知 id：不弹提示', alerts.length, 0)
check('未知 id：弹层保持关闭', elements.previewModal.hidden, true)

/* 7. 文本预览：抓下来转义进 pre */
async function textCases() {
  reset()
  global.filesData = { incoming: [TEXT], outgoing: [] }
  fetchBody = '<a>发票</a>'
  clickName('c3')
  await new Promise((resolve) => setTimeout(resolve, 0))
  check('文本：请求 /view', fetchCalls, ['/api/incoming/c3/view'])
  check('文本：包在 pre 里', elements.previewBody.innerHTML.startsWith('<pre class="preview-text">'), true)
  check('文本：内容被转义', elements.previewBody.innerHTML.includes('&lt;a&gt;发票&lt;/a&gt;'), true)

  /* 8. 超限的文本不渲染，避免把页面卡死 */
  reset()
  global.filesData = { incoming: [{ id: 'f6', name: 'big.xml', size: 2 * 1024 * 1024, preview: 'text' }], outgoing: [] }
  fetchCalls = []
  clickName('f6')
  await new Promise((resolve) => setTimeout(resolve, 0))
  check('大文件：不发请求', fetchCalls, [])
  check('大文件：提示下载后查看', elements.previewBody.innerHTML.includes('请下载后查看'), true)

  /* 9. 关闭时清空内容，别让 iframe 一直占着渲染进程 */
  reset()
  global.filesData = { incoming: [PDF], outgoing: [] }
  clickName('b2')
  elements.previewModal.click()
  check('点遮罩关闭：hidden 复位', elements.previewModal.hidden, true)
  check('点遮罩关闭：内容清空', elements.previewBody.innerHTML, '')
  check('点遮罩关闭：提示清空', elements.previewHint.textContent, '')

  /* 10. 「关闭」按钮同样有效 */
  reset()
  clickName('b2')
  elements.closePreviewBtn.click()
  check('点关闭按钮：hidden 复位', elements.previewModal.hidden, true)

  console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
  if (fail) process.exitCode = 1
}

textCases()
