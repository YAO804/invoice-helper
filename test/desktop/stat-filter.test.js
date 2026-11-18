/**
 * 台账统计卡片作为筛选入口的行为测试。
 *
 * 卡片和筛选面板共用同一份条件状态，所以这里既要验证「点卡片会写回面板」，
 * 也要验证「面板改了卡片会跟着亮灭」——两个方向都断，才能保证两处不打架。
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

function makeEl(id) {
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    checked: false,
    hidden: true,
    attributes: {},
    setAttribute(key, value) {
      this.attributes[key] = String(value)
    },
    getAttribute(key) {
      return this.attributes[key]
    }
  }
  return el
}

function el(id) {
  if (!elements[id]) elements[id] = makeEl(id)
  return elements[id]
}

global.document = { getElementById: el, addEventListener() {} }

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(WEB, file), 'utf8'), { filename: file })
}

load('render.js')
load('ledger-render.js')
load('ledger-stats.js')

function reset() {
  el('invOnlyDuplicates').checked = false
  el('invOnlyNeedFill').checked = false
  el('invCreatedFrom').value = ''
  el('invCreatedTo').value = ''
  el('invLatestDate').textContent = '2026-11-18'
  el('statDuplicates').attributes = {}
  el('statNeedFill').attributes = {}
  el('statLatest').attributes = {}
}

const toggle = (action) => vm.runInThisContext('toggleStatFilter("' + action + '")')
const sync = () => vm.runInThisContext('syncStatFilterState()')

/* 1. 重复组卡片：点一次勾上，再点一次取消 */
reset()
check('重复组：第一次返回需要刷新', toggle('duplicates'), true)
check('重复组：面板勾选被打开', el('invOnlyDuplicates').checked, true)
check('重复组：第二次返回需要刷新', toggle('duplicates'), true)
check('重复组：再点取消勾选', el('invOnlyDuplicates').checked, false)

/* 2. 待补录卡片同理，且两个条件互不干扰 */
reset()
toggle('needfill')
check('待补录：勾选被打开', el('invOnlyNeedFill').checked, true)
check('待补录：不影响重复组', el('invOnlyDuplicates').checked, false)

/* 3. 最近录入卡片：点一下把录入时间起止都设成那天，再点清空 */
reset()
toggle('latest')
check('最近录入：起止都填成那天', [el('invCreatedFrom').value, el('invCreatedTo').value],
  ['2026-11-18', '2026-11-18'])
toggle('latest')
check('最近录入：再点清空起止', [el('invCreatedFrom').value, el('invCreatedTo').value], ['', ''])

reset()
el('invCreatedFrom').value = '2026-11-01'
el('invCreatedTo').value = '2026-11-01'
toggle('latest')
check('最近录入：已筛别的日期时替换成最近那天',
  [el('invCreatedFrom').value, el('invCreatedTo').value], ['2026-11-18', '2026-11-18'])

/* 3.1 只填了一头（区间筛选）时，点卡片也要收成那一天 */
reset()
el('invCreatedFrom').value = '2026-11-01'
toggle('latest')
check('最近录入：只有下限时补齐上限',
  [el('invCreatedFrom').value, el('invCreatedTo').value], ['2026-11-18', '2026-11-18'])

/* 4. 没有台账时点最近录入卡片什么都不做 */
reset()
el('invLatestDate').textContent = '—'
check('最近录入：无数据不刷新', toggle('latest'), false)
check('最近录入：无数据不改条件',
  [el('invCreatedFrom').value, el('invCreatedTo').value], ['', ''])

/* 5. 未知动作直接忽略，别把别的条件弄乱 */
reset()
check('未知动作返回 false', toggle('whatever'), false)
check('未知动作不改条件', el('invOnlyDuplicates').checked, false)

/* 6. 高亮跟着真实条件走：手工勾选面板，卡片也要亮 */
reset()
sync()
check('初始状态三张卡片都没按下', [
  el('statDuplicates').getAttribute('aria-pressed'),
  el('statNeedFill').getAttribute('aria-pressed'),
  el('statLatest').getAttribute('aria-pressed')
], ['false', 'false', 'false'])

el('invOnlyDuplicates').checked = true
el('invOnlyNeedFill').checked = true
el('invCreatedFrom').value = '2026-11-18'
el('invCreatedTo').value = '2026-11-18'
sync()
check('勾选后面板对应的卡片都亮起', [
  el('statDuplicates').getAttribute('aria-pressed'),
  el('statNeedFill').getAttribute('aria-pressed'),
  el('statLatest').getAttribute('aria-pressed')
], ['true', 'true', 'true'])

/* 7. 录入时间不是那一天时，最近录入卡片不该亮 */
reset()
el('invCreatedFrom').value = '2026-11-01'
el('invCreatedTo').value = '2026-11-01'
sync()
check('筛了别的日期时最近录入卡片不亮', el('statLatest').getAttribute('aria-pressed'), 'false')

reset()
el('invCreatedFrom').value = '2026-11-01'
el('invCreatedTo').value = '2026-11-18'
sync()
check('区间覆盖但不等于某一天时也不亮', el('statLatest').getAttribute('aria-pressed'), 'false')

/* 8. 最近录入日期取后端字段，不取列表第一行，且只显示日期 */
reset()
vm.runInThisContext(`renderInvoiceStats({
  total: 2,
  duplicate_groups: 0,
  need_fill: 1,
  latest_created_at: '2026-11-18 09:37:29',
  items: [{ created_at: '2026-11-01 08:00:00' }, { created_at: '2026-11-18 09:37:29' }]
})`)
check('最近录入只显示日期', el('invLatestDate').textContent, '2026-11-18')

vm.runInThisContext('renderInvoiceStats({ total: 0, items: [] })')
check('空台账显示占位符', el('invLatestDate').textContent, '—')

/* 8.1 只在日期里没有时间时也不该把整串塞进卡片 */
vm.runInThisContext(`renderInvoiceStats({ total: 1, latest_created_at: '2026-11-18' })`)
check('纯日期原样显示', el('invLatestDate').textContent, '2026-11-18')

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
if (fail) process.exitCode = 1
