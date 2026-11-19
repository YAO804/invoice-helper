/**
 * 导入确认后的结果提示回归。
 *
 * 后端现在会跳过重复票，界面必须把「跳过了多少」说出来，
 * 否则用户看到「已导入 3 张」而文件里有 5 行，会以为数据丢了。
 *
 *   node test/desktop/import-result.test.js
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

global.$ = function () { return { textContent: '', hidden: true } }

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../../desktop/web/time.js'), 'utf8'), { filename: 'time.js' })
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-render.js'), 'utf8'),
  { filename: 'ledger-render.js' }
)

function text(result) {
  return renderImportResult(result).replace(/^<p class="hint">/, '').replace(/<\/p>$/, '')
}

check('全部导入成功', text({ imported: 3, duplicate: 0, invalid: 0 }), '已导入 3 张发票。')
check('跳过重复要写出来', text({ imported: 3, duplicate: 2, invalid: 0 }), '已导入 3 张发票，跳过重复 2 张。')
check('跳过缺号码也要写出来', text({ imported: 3, duplicate: 0, invalid: 1 }), '已导入 3 张发票，跳过缺发票号码 1 张。')
check(
  '两种跳过同时出现',
  text({ imported: 3, duplicate: 2, invalid: 1 }),
  '已导入 3 张发票，跳过重复 2 张、缺发票号码 1 张。'
)
check('一行都没导入也要说清楚', text({ imported: 0, duplicate: 5, invalid: 0 }), '已导入 0 张发票，跳过重复 5 张。')
check('字段缺失不报错', text({}), '已导入 0 张发票。')
check('用 hint 样式', renderImportResult({ imported: 1 }).startsWith('<p class="hint">'), true)

// 页面必须走这个函数，不许再自己拼一句「已导入 N 张」把跳过数量藏起来
const app = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-app.js'), 'utf8')
check('确认导入调用统一的结果渲染', /renderImportResult\(result\)/.test(app), true)
check('旧的裸文案不许回来', /已导入 \$\{result\.imported\} 张发票/.test(app), false)

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
