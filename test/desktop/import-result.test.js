/**
 * 导入确认后的结果提示回归。
 *
 * 两种口径必须说两套话：跳过重复要说「跳过多少」，全量导入要说「重复的进了台账」。
 * 含糊其辞会让用户以为数据丢了，或者以为重复被悄悄处理了。
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

function contains(name, actual, needle) {
  check(name + '（含「' + needle + '」）', actual.includes(needle), true)
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

/** 去掉标签、压平空白，只留用户真正看到的那句话 */
function text(result) {
  return renderImportResult(result).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

check('跳过口径：全部新增', text({ imported: 3, duplicate: 0, invalid: 0, skip_duplicates: true }), '已导入 3 张发票。')
check(
  '跳过口径：重复要写出来',
  text({ imported: 3, duplicate: 2, invalid: 0, skip_duplicates: true }),
  '已导入 3 张发票，跳过重复 2 张。'
)
check(
  '跳过口径：两种跳过同时出现',
  text({ imported: 3, duplicate: 2, invalid: 1, skip_duplicates: true }),
  '已导入 3 张发票，跳过重复 2 张、缺发票号码 1 张。'
)
check(
  '跳过口径：一行都没导入也要说清楚',
  text({ imported: 0, duplicate: 5, invalid: 0, skip_duplicates: true }),
  '已导入 0 张发票，跳过重复 5 张。'
)

const allIn = text({ imported: 5, duplicate: 2, invalid: 1, skip_duplicates: false })
contains('全量口径：说明是全部导入', allIn, '已全量导入 5 张发票')
contains('全量口径：点明其中多少张重复', allIn, '其中 2 张是重复的')
contains('全量口径：指出重复已进台账', allIn, '重复记录已进台账')
contains('全量口径：给出清理路径', allIn, '「查重」')
check('全量口径：不能说成跳过', allIn.includes('跳过'), false)

check('字段缺失不报错', text({}), '已导入 0 张发票。')
check('口径缺省按跳过处理', text({ imported: 1, duplicate: 1 }), '已导入 1 张发票，跳过重复 1 张。')
check('用 hint 样式', renderImportResult({ imported: 1 }).startsWith('<p class="hint">'), true)

// 页面必须走这个函数，不许再自己拼一句「已导入 N 张」把跳过数量藏起来
const app = fs.readFileSync(path.join(__dirname, '../../desktop/web/ledger-app.js'), 'utf8')
check('确认导入调用统一的结果渲染', /renderImportResult\(result\)/.test(app), true)
check('旧的裸文案不许回来', /已导入 \$\{result\.imported\} 张发票/.test(app), false)

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
