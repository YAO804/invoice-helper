/**
 * 桌面端脚本加载回归测试。
 *
 * 线上出过一次事故：login.js 和 render.js 都在顶层声明了 $，
 * 两个经典脚本合到同一全局环境时 render.js 整份抛 SyntaxError，
 * 界面只剩「服务异常 / renderStatus is not defined」。
 * 这里按 index.html 的真实顺序把全部脚本塞进同一个 VM 上下文，
 * 只要再出现全局声明冲突或某个脚本加载即崩，测试就会挂。
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
  } else {
    fail++
    console.log('FAIL ' + name)
    console.log('  实际: ' + a)
    console.log('  期望: ' + e)
  }
}

const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script src="\/([^"]+\.js)"><\/script>/g)].map((m) => m[1])

function makeEl(id) {
  return {
    id,
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    href: '',
    src: '',
    dataset: {},
    addEventListener() {},
    setAttribute() {},
    classList: { add() {}, remove() {}, toggle() {} }
  }
}

const elements = {}
const context = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  JSON,
  Math,
  Promise,
  Set,
  Map,
  URL,
  encodeURIComponent,
  decodeURIComponent,
  alert() {},
  confirm() { return false },
  prompt() {},
  fetch: async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => '' }),
  navigator: { clipboard: null },
  document: {
    hidden: false,
    getElementById(id) { return elements[id] || (elements[id] = makeEl(id)) },
    addEventListener() {},
    createElement(tag) { return makeEl(tag) },
    body: { appendChild() {}, removeChild() {} },
    execCommand() {}
  }
}
context.window = context
vm.createContext(context)

let loadError = null
try {
  for (const file of scripts) {
    const source = fs.readFileSync(path.join(WEB, file), 'utf8')
    vm.runInContext(source, context, { filename: file })
  }
} catch (error) {
  loadError = error.name + ': ' + error.message
}

check('按 index.html 顺序加载全部脚本无报错', loadError, null)
check('render.js 的 renderStatus 可用', vm.runInContext('typeof renderStatus', context), 'function')
check('控制台入口已挂载', typeof context.startDesktopApp, 'function')
check('台账入口已挂载', typeof context.startLedgerApp, 'function')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
