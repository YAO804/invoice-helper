/**
 * Excel 粘贴导入回归测试。
 *
 * 从 Excel 复制的是 TSV，转成 CSV 后复用 /api/invoices/import 链路。
 * 这里守住转换口径和错误提示，避免表头/金额被悄悄改错。
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const WEB = path.join(__dirname, '../../desktop/web')
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
const source = fs.readFileSync(path.join(WEB, 'paste-import.js'), 'utf8')
const appSource = fs.readFileSync(path.join(WEB, 'ledger-app.js'), 'utf8')

let fail = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const context = { console }
vm.createContext(context)
vm.runInContext(source, context)

console.log('--- TSV 转 CSV ---')
check('基本转换',
  context.tsvToCSV('发票号码\t报销人\nN001\t张三'),
  '发票号码,报销人\nN001,张三')
check('含逗号的值加引号',
  context.tsvToCSV('报销人\n张,三'),
  '报销人\n"张,三"')
check('空行被跳过',
  context.tsvToCSV('发票号码\nN001\n\nN002'),
  '发票号码\nN001\nN002')
check('末尾空列被裁掉',
  context.tsvToCSV('发票号码\t报销人\nN001\t张三\t\t'),
  '发票号码,报销人\nN001,张三')

console.log('\n--- 错误提示 ---')
check('空内容', context.pasteImportError(''), '请先从 Excel 复制表格内容并粘贴')
check('只有表头', context.pasteImportError('发票号码\t报销人'),
  '只有表头没有数据行，请连同要导入的发票一起复制')
check('表头不标准', context.pasteImportError('发票号\t报销人\nN001\t张三'),
  '表头里没有「发票号码」，请使用下载的模板或补上这一列')
check('合法内容无错误', context.pasteImportError('发票号码\t报销人\nN001\t张三'), '')

console.log('\n--- 页面接线 ---')
check('有粘贴导入按钮', html.indexOf('id="invoicePasteBtn"') >= 0, true)
check('有粘贴模态框', html.indexOf('id="pasteImportModal"') >= 0, true)
check('有粘贴文本域', html.indexOf('id="pasteImportText"') >= 0, true)
check('paste-import.js 在 ledger-app.js 之前加载',
  html.indexOf('/paste-import.js') < html.indexOf('/ledger-app.js'), true)
check('按钮触发隐藏文件框', /#invoiceImportBtn[\s\S]{0,120}invoiceImportFile['"]\)\.click\(\)/.test(appSource), true)
check('文件框绑定 change', /\$\('invoiceImportFile'\)\.addEventListener\('change', previewImport\)/.test(appSource), true)
check('导入只接受 xlsx', /id="invoiceImportFile"[^>]*accept="\.xlsx/.test(html), true)
check('按钮文案只写 Excel', /id="invoiceImportBtn"[^>]*>导入 Excel<\/button>/.test(html), true)

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 项失败'))
process.exit(fail ? 1 : 0)
