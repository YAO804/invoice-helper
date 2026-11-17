/**
 * fsx.js 逻辑回归测试（内存文件系统 mock）
 *
 * 微信 API 在 node 里不存在，所以这里 mock 掉 wx.getFileSystemManager。
 * 验证的是纯逻辑：递归遍历、总量统计、30 天 TTL 清理。
 * 真实环境的容量限制仍需真机验证。
 *
 *   node test/miniprogram/fsx.test.js
 */

/* ---------- mock 内存文件系统 ---------- */

const nodes = new Map()   // path -> { type, size, mtime }
let failCount = 0

function statSync(p) {
  const n = nodes.get(p)
  if (!n) throw new Error('no such file or directory: ' + p)
  return {
    isDirectory: () => n.type === 'dir',
    isFile: () => n.type === 'file',
    size: n.size || 0,
    lastModifiedTime: n.mtime || 0
  }
}

function readdirSync(p) {
  if (!nodes.has(p)) throw new Error('not a directory: ' + p)
  const prefix = p.endsWith('/') ? p : p + '/'
  const out = new Set()
  nodes.forEach(function (v, k) {
    if (k.startsWith(prefix)) {
      const rest = k.slice(prefix.length)
      if (rest && rest.indexOf('/') === -1) out.add(rest)
    }
  })
  return Array.from(out)
}

const mockFs = {
  accessSync(p) {
    if (!nodes.has(p)) throw new Error('access denied: ' + p)
  },
  mkdirSync(p) {
    nodes.set(p, { type: 'dir' })
  },
  readdirSync,
  statSync,
  unlinkSync(p) {
    nodes.delete(p)
  }
}

global.wx = {
  env: { USER_DATA_PATH: '/mock' },
  getFileSystemManager: function () { return mockFs }
}

/* ---------- 载入被测模块 ---------- */

const fsx = require('../../miniprogram/utils/fsx')

/* ---------- 断言 ---------- */

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '  实际 ' + JSON.stringify(actual)))
}

/* ---------- 构造测试数据 ---------- */

const now = Math.floor(Date.now() / 1000)
const DIR = '/mock/invoices'

nodes.set('/mock', { type: 'dir' })
nodes.set(DIR, { type: 'dir' })
nodes.set(DIR + '/2026-11.xml', { type: 'file', size: 1000, mtime: now })
nodes.set(DIR + '/2026-10.pdf', { type: 'file', size: 2000, mtime: now - 40 * 86400 })  // 40 天前，应被清理
nodes.set(DIR + '/sub', { type: 'dir' })
nodes.set(DIR + '/sub/ticket.ofd', { type: 'file', size: 500, mtime: now })

/* ---------- 用例 ---------- */

console.log('--- walk ---')
const list = fsx.walk(DIR)
check('递归找到 3 个文件', list.length, 3)
check('包含子目录文件', list.some(f => f.name === 'ticket.ofd'), true)
check('不把目录当文件', list.some(f => f.name === 'sub'), false)

console.log('\n--- totalSize / human ---')
check('总量 = 3500', fsx.totalSize(list), 3500)
check('human(3500)', fsx.human(3500), '3.4 KB')
check('human(0)', fsx.human(0), '0 B')

console.log('\n--- cleanExpired(30 天) ---')
const removed = fsx.cleanExpired(DIR, 30)
check('只删掉 40 天前那个', removed.map(r => r.name), ['2026-10.pdf'])
check('删除后剩 2 个', fsx.walk(DIR).length, 2)
check('未过期文件仍在', nodes.has(DIR + '/2026-11.xml'), true)

console.log('\n--- 边界 ---')
check('walk 不存在的目录返回空数组', fsx.walk('/mock/not-exist'), [])
check('空目录清理不报错', fsx.cleanExpired('/mock/empty', 30), [])

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
