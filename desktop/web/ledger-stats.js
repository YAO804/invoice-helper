/**
 * 台账顶部的统计卡片兼筛选入口。
 *
 * 卡片和筛选面板共用同一份条件状态（勾选框、录入时间起止），
 * 点卡片就等于填上面板里那两个输入框，两处永远一致，
 * 不会出现「卡片亮着但面板没条件」这种看不懂的状态。
 */

const STAT_CHECKBOX = { duplicates: 'invOnlyDuplicates', needfill: 'invOnlyNeedFill' }

/** 卡片上显示的日期；没有台账时显示的是「—」 */
function statLatestDate() {
  const text = ($('invLatestDate').textContent || '').trim()
  return text === '—' ? '' : text
}

/**
 * 切换某个卡片对应的筛选条件，返回 true 表示条件变了、调用方该刷新列表。
 * 「最近录入」是一个日期开关：点一下把录入时间起止都设成那天，再点一下清空。
 */
function toggleStatFilter(action) {
  if (action === 'latest') {
    const date = statLatestDate()
    if (!date) return false
    const from = $('invCreatedFrom')
    const to = $('invCreatedTo')
    const already = (from.value || '').trim() === date && (to.value || '').trim() === date
    from.value = already ? '' : date
    to.value = already ? '' : date
    return true
  }

  const id = STAT_CHECKBOX[action]
  if (!id) return false
  const box = $(id)
  box.checked = !box.checked
  return true
}

/** 卡片高亮跟随真实筛选状态：面板里改了日期，卡片也要跟着亮灭 */
function syncStatFilterState() {
  setStatPressed('statDuplicates', $('invOnlyDuplicates').checked)
  setStatPressed('statNeedFill', $('invOnlyNeedFill').checked)

  const date = statLatestDate()
  const from = ($('invCreatedFrom').value || '').trim()
  const to = ($('invCreatedTo').value || '').trim()
  setStatPressed('statLatest', date !== '' && from === date && to === date)
}

function setStatPressed(id, pressed) {
  const card = $(id)
  if (!card) return
  card.setAttribute('aria-pressed', pressed ? 'true' : 'false')
}
