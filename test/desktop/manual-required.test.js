/**
 * 网页手动新增的必填与金额格式校验回归。
 *
 * 只管新增：补录老票允许字段不全（need_fill 就是这么来的），别一起卡死。
 * 金额在台账里是字符串，但必须是数字写法，否则筛选和合计都会错。
 *
 *   node test/desktop/manual-required.test.js
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const elements = {}
function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', checked: false, hidden: true,
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll() { return [] }
  }
}
global.$ = function (id) { return elements[id] || (elements[id] = makeEl(id)) }

let alerts = []
let created = []
let updated = []
global.document = {
  getElementById: global.$,
  addEventListener() {},
  querySelectorAll() { return [] },
  createElement() { return makeEl('created') },
  body: { appendChild() {} }
}
global.window = { refresh: null }
global.alert = function (message) { alerts.push(message) }
global.confirm = function () { return true }
global.setInterval = function () { return 0 }
global.createInvoice = async function (payload) { created.push(payload); return { number_warning: '' } }
global.updateInvoice = async function (id, payload) { updated.push({ id, payload }); return { number_warning: '' } }
global.deleteInvoices = async function () {}
global.fetchInvoices = async function () { return { items: [], duplicates: [] } }
global.fetchNumberWarning = async function () { return null }

vm.runInThisContext(fs.readFileSync(path.join(WEB, 'suggest.js'), 'utf8'), { filename: 'suggest.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'modal-guard.js'), 'utf8'), { filename: 'modal-guard.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'form-validate.js'), 'utf8'), { filename: 'form-validate.js' })
vm.runInThisContext(fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

const run = (code) => vm.runInThisContext(code)
const full = {
  number: '00813251', code: '032002300911', kind: '电子发票',
  issue_date: '2026-11-20', total: '176.99', reimburser: ''
}
function fill(values) {
  Object.keys(full).forEach((field) => {
    const ids = {
      number: 'editNumber', code: 'editCode', kind: 'editKind',
      issue_date: 'editIssueDate', total: 'editTotal', reimburser: 'editReimburser'
    }
    $(ids[field]).value = values[field] || ''
  })
}
function reset() { alerts = []; created = []; updated = [] }

;(async () => {
console.log('--- 金额必须像数字 ---')
check('整数合法', isNumericTotal('123'), true)
check('两位小数合法', isNumericTotal('176.99'), true)
check('红冲票负号合法', isNumericTotal('-88.00'), true)
check('两侧空白不看', isNumericTotal('  66.5  '), true)
check('文字不合法', isNumericTotal('一百元'), false)
check('夹中文不合法', isNumericTotal('100元'), false)
check('千分位不合法', isNumericTotal('1,234.00'), false)
check('科学计数法不合法', isNumericTotal('1e3'), false)
check('多个小数点不合法', isNumericTotal('1.2.3'), false)
check('空串不合法', isNumericTotal(''), false)

console.log('\n--- 新增：除报销人外全部必填 ---')
check('填全了没问题', validateNewInvoice(full), [])
const missingCode = Object.assign({}, full, { code: '' })
check('缺代码要点名', validateNewInvoice(missingCode), ['请填写发票代码'])
check('缺金额要点名', validateNewInvoice(Object.assign({}, full, { total: '' })), ['请填写价税合计'])
check('缺日期要点名', validateNewInvoice(Object.assign({}, full, { issue_date: '' })), ['请填写开票日期'])
check('一次列出多个缺失',
  validateNewInvoice({ number: '', code: '', kind: '', issue_date: '', total: '', reimburser: '' }),
  ['请填写发票号码', '请填写发票代码', '请填写票种', '请填写开票日期', '请填写价税合计'])
check('报销人空着照样通过', validateNewInvoice(Object.assign({}, full, { reimburser: '' })), [])
check('金额是文字要点名', validateNewInvoice(Object.assign({}, full, { total: '一百元' })), ['价税合计必须填数字，例如 176.99'])

console.log('\n--- 保存按钮真的挡住新增 ---')
reset()
fill(full)
run('editingId = 0')
await run('saveEdit()')
check('填全能新增', created.length, 1)
check('填全不报警', alerts, [])

reset()
fill(Object.assign({}, full, { code: '', total: '一百元' }))
run('editingId = 0')
await run('saveEdit()')
check('缺字段+金额文字不新增', created.length, 0)
check('一次报出两个问题', alerts, ['请填写发票代码\n价税合计必须填数字，例如 176.99'])

reset()
fill(Object.assign({}, full, { reimburser: '' }))
run('editingId = 0')
await run('saveEdit()')
check('报销人不填也新增', created.length, 1)

console.log('\n--- 补录不跟着变严 ---')
reset()
fill({ number: '00813251', code: '', kind: '', issue_date: '', total: '', reimburser: '张三' })
run('editingId = 42')
await run('saveEdit()')
check('老票只有号码也能补录', updated.length, 1)
check('补录不报警', alerts, [])

reset()
fill(Object.assign({}, full, { number: '' }))
run('editingId = 42')
await run('saveEdit()')
check('补录仍要求号码', alerts, ['发票号码不能为空'])
check('补录号码空不写库', updated.length, 0)

console.log('\n--- 页面接线 ---')
const app = fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8')
check('新增分支走校验', /const problems = creating \? validateNewInvoice\(payload\)/.test(app), true)
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
check('校验模块在 app 之前加载', html.indexOf('/form-validate.js') < html.indexOf('/ledger-app.js'), true)
check('五个必填字段带星号', (html.match(/<span class="required">\*<\/span>/g) || []).length >= 5, true)
check('报销人字段没有星号', /报销人 <input id="editReimburser"/.test(html), true)
check('新增才有星号提示', /toggleRequiredMarks\(!item\)/.test(app), true)

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
})().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
