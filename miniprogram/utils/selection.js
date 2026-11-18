/**
 * 列表勾选的纯逻辑。页面只管渲染，选中集合怎么变都在这里，
 * 免得「切分段要清空」「删完要剔除失效项」这类规则散在事件里各写一遍。
 */

function toggle(selected, id) {
  const ids = (selected || []).slice()
  const index = ids.indexOf(id)
  if (index < 0) ids.push(id)
  else ids.splice(index, 1)
  return ids
}

/** 剔除当前列表里已经不存在的选中项 */
function prune(selected, available) {
  const ids = available || []
  return (selected || []).filter(function (id) { return ids.indexOf(id) >= 0 })
}

function mark(list, selected) {
  const ids = selected || []
  return (list || []).map(function (item) {
    return Object.assign({}, item, { checked: ids.indexOf(item.id) >= 0 })
  })
}

function allSelected(list, selected) {
  const items = list || []
  return items.length > 0 && (selected || []).length === items.length
}

module.exports = {
  toggle: toggle,
  prune: prune,
  mark: mark,
  allSelected: allSelected
}
