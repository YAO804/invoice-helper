/**
 * 列表勾选逻辑：切分段清空、删完剔除失效项、全选判定。
 *
 *   node test/miniprogram/selection.test.js
 */

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

const selection = require('../../miniprogram/utils/selection')

check('勾上', selection.toggle([], 'a'), ['a'])
check('再点取消', selection.toggle(['a'], 'a'), [])
check('勾多个保持顺序', selection.toggle(['a'], 'b'), ['a', 'b'])
check('不改原数组', (function () {
  const origin = ['a']
  selection.toggle(origin, 'b')
  return origin
})(), ['a'])

check('剔除已不存在的', selection.prune(['a', 'x'], ['a', 'b']), ['a'])
check('全都不在列表里就清空', selection.prune(['x'], ['a']), [])
check('没有选中项', selection.prune([], ['a']), [])

check('补 checked', selection.mark([{ id: 'a' }, { id: 'b' }], ['b']),
  [{ id: 'a', checked: false }, { id: 'b', checked: true }])
check('空列表标记为空', selection.mark([], ['a']), [])
check('不改原条目', (function () {
  const origin = [{ id: 'a' }]
  selection.mark(origin, ['a'])
  return origin
})(), [{ id: 'a' }])

check('全选判定', selection.allSelected([{ id: 'a' }, { id: 'b' }], ['a', 'b']), true)
check('部分选中不算全选', selection.allSelected([{ id: 'a' }, { id: 'b' }], ['a']), false)
check('空列表不算全选', selection.allSelected([], []), false)

console.log(failCount === 0 ? '\n全部通过' : '\n失败 ' + failCount + ' 项')
process.exit(failCount === 0 ? 0 : 1)
