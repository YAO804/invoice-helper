/**
 * collect.js / archive.js 回归测试：模拟 wx API，不依赖微信环境。
 *
 *   node test/collect.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

/* ---------- 模拟微信环境（必须在 require 之前） ---------- */

const XML = `<?xml version="1.0" encoding="utf-8"?>
<EInvoice>
  <Header>
    <EIid>26932000001295659876</EIid>
    <InherentLabel><GeneralOrSpecialVAT><LabelCode>02</LabelCode><LabelName>普通发票</LabelName></GeneralOrSpecialVAT></InherentLabel>
  </Header>
  <EInvoiceData>
    <SellerInformation><SellerName>宁波顺渝餐饮管理有限公司</SellerName><SellerIdNum>91330205MACB4PTU91</SellerIdNum></SellerInformation>
    <BuyerInformation><BuyerName>姚未正（个人）</BuyerName></BuyerInformation>
    <BasicInformation><TotalAmWithoutTax>138.68</TotalAmWithoutTax><TotalTaxAm>8.32</TotalTaxAm><TotalTax-includedAmount>147.00</TotalTax-includedAmount></BasicInformation>
    <IssuItemInformation><ItemName>*生产生活服务*餐饮</ItemName><TaxRate>0.06</TaxRate><Amount>138.68</Amount><ComTaxAm>8.32</ComTaxAm><TotaltaxIncludedAmount>147.00</TotaltaxIncludedAmount></IssuItemInformation>
  </EInvoiceData>
  <TaxSupervisionInfo><InvoiceNumber>26932000001295659876</InvoiceNumber><IssueTime>2026-08-02</IssueTime></TaxSupervisionInfo>
  <TaxBureauSignature><SignatureValue>MIIB</SignatureValue></TaxBureauSignature>
</EInvoice>`

const files = { '/tmp/src.xml': XML }
const copied = []

function fakeFs() {
  return {
    accessSync() {},
    mkdirSync() {},
    writeFileSync(p, s) { files[p] = s },
    readFileSync(p) {
      if (files[p] === undefined) throw new Error('ENOENT ' + p)
      return files[p]
    },
    copyFileSync(from, to) { files[to] = files[from]; copied.push({ from: from, to: to }) }
  }
}

let scanResult = { result: '' }
let chooseResult = { tempFiles: [] }

global.wx = {
  env: { USER_DATA_PATH: '/usr' },
  getFileSystemManager: fakeFs,
  getFileInfo(o) { o.success && o.success({ digest: 'abcdef1234567890' }) },
  scanCode(o) { o.success && o.success(scanResult) },
  chooseMessageFile(o) { o.success && o.success(chooseResult) },
  showModal(o) { o.success && o.success({ confirm: false }) }
}

const archive = require('../miniprogram/utils/archive')
const collect = require('../miniprogram/utils/collect')

console.log('--- 纯函数 ---')
check('扩展名', collect.extOf('a.b.XML'), 'xml')
check('无扩展名', collect.extOf('README'), '')
check('清洗文件名', archive.safeName('a/b:c*?.xml'), 'a_b_c__.xml')
check('兜底哈希稳定', archive.fallbackDigest('a.xml', 123), archive.fallbackDigest('a.xml', 123))
check('兜底哈希随内容变', archive.fallbackDigest('a.xml', 123) !== archive.fallbackDigest('b.xml', 123), true)

console.log('\n--- 原件存档 ---')
archive.save('/tmp/src.xml', '发票/xml..xml', 4304).then(function (saved) {
  check('用 md5 前 8 位命名', saved.digest.slice(0, 8), 'abcdef12')
  check('落盘到私有 files 目录', saved.path.indexOf('/usr/invoices/files/abcdef12_') === 0, true)
  check('复制动作发生', copied.length > 0, true)
  check('文件条目可写进台账', saved.name.length > 0 && saved.size === 4304, true)

  console.log('\n--- 扫码草稿（S1 真实样本）---')
  scanResult = { result: '01,31,,26932000001877489821,10500.00,20261110,,277D' }
  return collect.scanDraft()
}).then(function (r) {
  check('扫码成功', r.ok, true)
  check('草稿发票号码', r.draft.invoice_no, '26932000001877489821')
  check('草稿来源', r.draft.source, 'qr')
  check('原始二维码保留', r.draft.raw_qr.indexOf('01,31,') === 0, true)

  scanResult = { result: 'https://example.com/invoice?v=1' }
  return collect.scanDraft()
}).then(function (r) {
  check('链接型二维码不自动解析', r.ok, false)

  console.log('\n--- 文件导入：XML ---')
  chooseResult = { tempFiles: [{ name: 'dzfp.xml', path: '/tmp/src.xml', size: 4304 }] }
  return collect.fileDraft()
}).then(function (r) {
  check('XML 导入成功', r.ok, true)
  check('自动填销方', r.draft.seller_name, '宁波顺渝餐饮管理有限公司')
  check('自动填金额（分）', r.draft.total_cent, 14700)
  check('来源为 xml', r.draft.source, 'xml')
  check('带原件条目', r.draft.files.length, 1)
  check('XML 提示不写进备注', r.draft.note, '')
  check('XML 有独立提示', r.draft.hint.indexOf('自动填全') > 0, true)
  check('真实样本无勾稽异常', r.draft.anomaly, [])

  console.log('\n--- 文件导入：OFD / 不支持的格式 ---')
  chooseResult = { tempFiles: [{ name: '票.ofd', path: '/tmp/src.xml', size: 76327 }] }
  return collect.fileDraft()
}).then(function (r) {
  check('OFD 存档成功', r.ok, true)
  check('OFD 来源', r.draft.source, 'ofd')
  check('OFD 字段待补录提示', r.draft.hint.indexOf('字段请补录') > 0, true)
  check('提示不污染备注字段', r.draft.note, '')
  check('OFD 带原件', r.draft.files.length, 1)

  chooseResult = { tempFiles: [{ name: 'photo.jpg', path: '/tmp/src.xml', size: 100 }] }
  return collect.fileDraft()
}).then(function (r) {
  check('不支持的格式被拒', r.ok, false)
  check('给出扩展名提示', r.message.indexOf('jpg') > 0, true)

  console.log('\n--- 批量导入 ---')
  chooseResult = { tempFiles: [
    { name: 'a.xml', path: '/tmp/src.xml', size: 4304 },
    { name: 'b.ofd', path: '/tmp/src.xml', size: 100 },
    { name: 'c.jpg', path: '/tmp/src.xml', size: 50 }
  ] }
  return collect.fileDrafts()
}).then(function (r) {
  check('批量返回三条结果', r.results.length, 3)
  check('XML 成功', r.results[0].ok, true)
  check('OFD 成功', r.results[1].ok, true)
  check('单文件失败不影响其他', r.results[2].ok, false)

  console.log('\n--- 连续扫码（取消即止）---')
  scanResult = { result: '01,31,,26932000001877489821,10500.00,20261110,,277D' }
  return collect.scanDrafts()
}).then(function (r) {
  check('扫码收集到 1 张', r.drafts.length, 1)
  check('草稿号码正确', r.drafts[0].invoice_no, '26932000001877489821')

  console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
  process.exit(failCount === 0 ? 0 : 1)
}).catch(function (e) {
  console.error('测试异常：', e)
  process.exit(1)
})
