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
  el('invBatchFilter').value = ''
  el('invBatch').textContent = 'B20261118-093729-174'
  el('statDuplicates').attributes = {}
  el('statNeedFill').attributes = {}
  el('statBatch').attributes = {}
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

/* 3. 最新批次卡片：等于这个批次就取消，不等于就换成它 */
reset()
toggle('batch')
check('批次：填成最新批次', el('invBatchFilter').value, 'B20261118-093729-174')
toggle('batch')
check('批次：再点清空', el('invBatchFilter').value, '')

reset()
el('invBatchFilter').value = 'B20260101-000000-000'
toggle('batch')
check('批次：已筛别的批次时替换成最新', el('invBatchFilter').value, 'B20261118-093729-174')

/* 4. 没有台账时点批次卡片什么都不做 */
reset()
el('invBatch').textContent = '—'
check('批次：无数据不刷新', toggle('batch'), false)
check('批次：无数据不改条件', el('invBatchFilter').value, '')

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
  el('statBatch').getAttribute('aria-pressed')
], ['false', 'false', 'false'])

el('invOnlyDuplicates').checked = true
el('invOnlyNeedFill').checked = true
el('invBatchFilter').value = 'B20261118-093729-174'
sync()
check('勾选后面板对应的卡片都亮起', [
  el('statDuplicates').getAttribute('aria-pressed'),
  el('statNeedFill').getAttribute('aria-pressed'),
  el('statBatch').getAttribute('aria-pressed')
], ['true', 'true', 'true'])

/* 7. 批次筛选值和最新批次不一致时，批次卡片不该亮 */
reset()
el('invBatchFilter').value = 'B20260101-000000-000'
sync()
check('筛了别的批次时批次卡片不亮', el('statBatch').getAttribute('aria-pressed'), 'false')

/* 8. 最新批次取后端字段，不取列表第一行 */
reset()
vm.runInThisContext(`renderInvoiceStats({
  total: 2,
  duplicate_groups: 0,
  need_fill: 1,
  latest_batch: 'B20261118-093729-174',
  items: [{ batch: 'B20260101-000000-000' }, { batch: 'B20261118-093729-174' }]
})`)
check('最新批次用 latest_batch', el('invBatch').textContent, 'B20261118-093729-174')

vm.runInThisContext('renderInvoiceStats({ total: 0, items: [] })')
check('空台账显示占位符', el('invBatch').textContent, '—')

console.log('\n合计 ' + (pass + fail) + ' 项：PASS ' + pass + ' · FAIL ' + fail)
if (fail) process.exitCode = 1
