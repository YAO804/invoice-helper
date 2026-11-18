/**
 * 批量上传进度回调的下标语义测试。
 *
 * 线上出过一次：一个文件显示两行进度条、第一行永远「等待 0%」。
 * 根因是 postFiles 回调 1 起的「第几个」，调用方却按下标写数组，写空了一位。
 * 光看界面是看不出下标错了的，所以这里直接把下标序列断言出来。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

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

global.fetch = async () => ({ ok: true, json: async () => ({}) })

class FakeFormData {
  constructor() {
    this.entries = []
  }
  append(key, value) {
    this.entries.push([key, value])
  }
}

const sentOrder = []

class FakeXHR {
  constructor() {
    this.upload = {}
    this.status = 0
    this.responseText = ''
  }

  open(method, url) {
    this.method = method
    this.url = url
  }

  send(form) {
    const file = form.entries[0][1]
    sentOrder.push(file.name)
    setTimeout(() => {
      // 推一次进度事件就够覆盖「上传中」这条路径，推多次只会让断言噪音变大
      if (this.upload.onprogress) this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 })
      this.status = 201
      this.responseText = JSON.stringify({ name: file.name, duplicate: file.name.indexOf('dup') >= 0 })
      this.onload()
    }, 0)
  }
}

global.FormData = FakeFormData
global.XMLHttpRequest = FakeXHR

const source = fs.readFileSync(path.join(__dirname, '../../desktop/web/api.js'), 'utf8')
vm.runInThisContext(source, { filename: 'api.js' })

/** 收集回调：每条 [index, name, percent, state] */
function collect() {
  const calls = []
  const onProgress = (index, name, percent, state) => calls.push([index, name, percent, state])
  return { calls, onProgress }
}

async function main() {
  /* 1. 单文件：下标只能是 0 */
  let sink = collect()
  await postFiles('/api/files/outgoing', [{ name: 'a.pdf' }], {}, sink.onProgress)
  check('单文件：只回调两次', sink.calls.length, 2)
  check('单文件：下标都是 0', sink.calls.map((c) => c[0]), [0, 0])
  check('单文件：先「上传中」再「完成」', sink.calls.map((c) => c[3]), ['上传中', '完成'])
  check('单文件：上传中按真实进度回报', sink.calls[0][2], 50)
  check('单文件：结束时 100%', sink.calls[1][2], 100)

  /* 2. 两个文件：下标必须是 0、1 —— 这就是当初的 bug */
  sentOrder.length = 0
  sink = collect()
  await postFiles('/api/files/outgoing', [{ name: 'a.pdf' }, { name: 'b.zip' }], {}, sink.onProgress)
  const indexes = sink.calls.map((c) => c[0])
  check('两文件：下标序列', indexes, [0, 0, 1, 1])
  check('两文件：没有出现 2', indexes.indexOf(2), -1)
  check('两文件：串行发送', sentOrder, ['a.pdf', 'b.zip'])

  /* 3. 用下标回写数组，不留空洞 —— 界面多一行空进度条就是这个空洞 */
  sink = collect()
  const names = ['a.pdf', 'b.zip', 'c.xml']
  const items = names.map((name) => ({ name, percent: 0, state: '等待' }))
  const write = (index, name, percent, state) => {
    if (index < 0 || index >= items.length) return
    items[index] = { name, percent, state }
  }
  await postFiles('/api/files/outgoing', names.map((name) => ({ name })), {}, write)
  check('三文件：数组长度不变', items.length, 3)
  check('三文件：没有空位', items.filter((item) => !item.name).length, 0)
  check('三文件：顺序与文件名一致', items.map((item) => item.name), names)
  check('三文件：全部完成', items.every((item) => item.state === '完成' && item.percent === 100), true)

  /* 4. 重复文件的状态文案 */
  sink = collect()
  await postFiles('/api/files/outgoing', [{ name: 'dup.pdf' }], {}, sink.onProgress)
  check('重复文件：状态写「已存在」', sink.calls[1][3], '已存在')

  /* 5. 单个文件失败不吞掉后面的错误提示（异常要能抛到调用方） */
  let failed = false
  const brokenXHR = FakeXHR
  global.XMLHttpRequest = class extends brokenXHR {
    send() {
      setTimeout(() => {
        this.status = 500
        this.responseText = JSON.stringify({ error: '空间不足' })
        this.onload()
      }, 0)
    }
  }
  try {
    await postFiles('/api/files/outgoing', [{ name: 'x.pdf' }], {}, () => {})
  } catch (error) {
    failed = error.message
  }
  check('上传失败：错误透出给调用方', failed, '空间不足')
  global.XMLHttpRequest = brokenXHR

  console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
  if (fail) process.exitCode = 1
}

main()
