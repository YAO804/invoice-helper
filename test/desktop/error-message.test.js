/**
 * 报错文案回归。
 *
 * 后端文案常自带动作前缀（「导入失败: xxx」），前端再拼一次就变成
 * 「导入失败：导入失败: xxx」——用户截图里就是这个样子。
 *
 *   node test/desktop/error-message.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const fs = require('fs')
const path = require('path')
const vm = require('vm')

let lastAlert = ''
const elements = {}
global.document = {
  getElementById: function (id) {
    if (!elements[id]) elements[id] = { textContent: '', innerHTML: '', hidden: true, value: '' }
    return elements[id]
  },
  addEventListener: function () {}
}
global.window = {}
global.alert = function (message) { lastAlert = message }

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/render.js'), 'utf8'), { filename: 'render.js' })
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/time.js'), 'utf8'), { filename: 'time.js' })
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-render.js'), 'utf8'), { filename: 'ledger-render.js' })
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-app.js'), 'utf8'), { filename: 'ledger-app.js' })

alertFailure('导入失败', new Error('导入失败: 台账文件正被别的程序占用，写不进去'))
check('后端已带前缀时不重复', lastAlert, '导入失败: 台账文件正被别的程序占用，写不进去')

alertFailure('导入失败', new Error('解析导入文件失败: 未找到包含发票表头的工作表'))
check('后端没带前缀时补上', lastAlert, '导入失败：解析导入文件失败: 未找到包含发票表头的工作表')

alertFailure('删除失败', new Error('没有这张发票'))
check('其他动作同样适用', lastAlert, '删除失败：没有这张发票')

alertFailure('导入失败', 'request:fail')
check('非 Error 对象也能处理', lastAlert, '导入失败：request:fail')

// 页面里不许再有「手拼前缀」的写法，否则重复前缀会重新长回来
const app = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-app.js'), 'utf8')
check('导入失败不再手拼前缀', /alert\('导入失败：'/.test(app), false)
check('删除失败不再手拼前缀', /alert\('删除失败：'/.test(app), false)
check('清理失败不再手拼前缀', /alert\('清理失败：'/.test(app), false)

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
