/**
 * 台账顶部的统计卡片兼筛选入口。
 *
 * 卡片和筛选面板共用同一份条件状态（勾选框、批次输入框），
 * 点卡片就等于勾上面板里那一项，两处永远一致，不会出现「卡片亮着但面板没勾」。
 */

const STAT_CHECKBOX = { duplicates: 'invOnlyDuplicates', needfill: 'invOnlyNeedFill' }

/** 卡片上显示的批次号；没有台账时显示的是「—」 */
function statBatchText() {
  const text = ($('invBatch').textContent || '').trim()
  return text === '—' ? '' : text
}

/**
 * 切换某个卡片对应的筛选条件，返回 true 表示条件变了、调用方该刷新列表。
 * 批次卡片是「只看这个批次」的开关，不是再点一次换成另一个批次。
 */
function toggleStatFilter(action) {
  if (action === 'batch') {
    const batch = statBatchText()
    if (!batch) return false
    const input = $('invBatchFilter')
    input.value = (input.value || '').trim() === batch ? '' : batch
    return true
  }

  const id = STAT_CHECKBOX[action]
  if (!id) return false
  const box = $(id)
  box.checked = !box.checked
  return true
}

/** 卡片高亮跟随真实筛选状态：在面板里取消勾选，卡片也要跟着灭掉 */
function syncStatFilterState() {
  setStatPressed('statDuplicates', $('invOnlyDuplicates').checked)
  setStatPressed('statNeedFill', $('invOnlyNeedFill').checked)

  const batch = statBatchText()
  const filtering = batch !== '' && ($('invBatchFilter').value || '').trim() === batch
  setStatPressed('statBatch', filtering)
}

function setStatPressed(id, pressed) {
  const card = $(id)
  if (!card) return
  card.setAttribute('aria-pressed', pressed ? 'true' : 'false')
}
