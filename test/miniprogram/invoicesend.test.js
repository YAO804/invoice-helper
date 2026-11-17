/**
 * 小程序扫码结果发送到电脑台账的回归测试。
 *
 *   node test/miniprogram/invoicesend.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const storage = { desktop_base_url: 'http://192.168.1.20:8765' }
let stubMatches = {}
let modalConfirm = false
let limitConfirm = false
let lastSendPayload = null
let lastModal = null
let many = []

global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  request(options) {
    if (options.url.indexOf('/api/invoices/check') >= 0) {
      return options.success({ statusCode: 200, data: { matches: stubMatches } })
    }
    lastSendPayload = options.data
    options.success({ statusCode: 200, data: { added: options.data.invoices.length, batch: 'B-TEST' } })
  },
  showModal(options) {
    lastModal = options
    const confirm = options.title === '超出单次发送限制' ? limitConfirm : modalConfirm
    options.success({ confirm: confirm })
  }
}

const invoicesend = require('../../miniprogram/utils/invoicesend')

function draft(number) {
  return {
    invoice_no: number,
    invoice_code: '',
    invoice_type: '数电票',
    issue_date: '2026-08-01',
    seller_name: '',
    seller_tax_id: '',
    buyer_name: '',
    buyer_tax_id: '',
    amount_excl_tax_cent: 0,
    tax_cent: 0,
    total_cent: 10500,
    tax_rate: null
  }
}

const converted = invoicesend.toInvoice(draft('N1'))
check('转换发票号码', converted.number, 'N1')
check('扫码草稿不含税金额留空', converted.amount, '')
check('扫码草稿价税合计', converted.total, '105.00')
check('扫码草稿税率留空', converted.tax_rate, '')

stubMatches = { N1: { number: 'N1', seller_name: '甲公司' } }
modalConfirm = false
invoicesend.send([draft('N1'), draft('N2')]).then(function (summary) {
  check('跳过重复后发送数', summary.sent, 1)
  check('跳过重复计数', summary.skipped, 1)
  check('只发送未重复发票', lastSendPayload.invoices.map(function (item) { return item.number }), ['N2'])

  stubMatches = {}
  return invoicesend.send([draft('N3'), draft('N4')])
}).then(function (summary) {
  check('无重复时发送数', summary.sent, 2)
  check('无重复时跳过数', summary.skipped, 0)

  stubMatches = { N1: { number: 'N1', seller_name: '甲公司' } }
  modalConfirm = true
  return invoicesend.send([draft('N1'), draft('N5')])
}).then(function (summary) {
  check('仍然发送时数量', summary.sent, 2)
  check('仍然发送时跳过数', summary.skipped, 0)

  for (let i = 0; i < 205; i++) many.push(draft('B' + i))
  limitConfirm = false
  return invoicesend.send(many)
}).then(function (summary) {
  check('超限取消不再发送', summary.cancelled, true)
  check('超限有明确提示', lastModal.title, '超出单次发送限制')

  limitConfirm = true
  return invoicesend.send(many)
}).then(function (summary) {
  check('超限只发送前200张', lastSendPayload.invoices.length, 200)
  check('超限发送数', summary.sent, 200)
  check('超限剩余张数', summary.left, 5)

  console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
  process.exit(failCount === 0 ? 0 : 1)
})
