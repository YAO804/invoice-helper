/**
 * 电脑端台账的只读镜像。
 *
 * 小程序端不保存任何台账数据：页面每次进来都重新问电脑端要，
 * 退出小程序即失效。这样只有一份权威数据，不需要两端对账。
 *
 * 缓存除了给列表页渲染，还负责「扫码当场判重」：
 * 扫码时拿号码+代码在内存索引里查一次，命中就提示用户。
 */

const lanservice = require('./lanservice')

const SORTS = ['created', 'number', 'issued', 'reimburser']

const EMPTY = { items: [], duplicates: [], total: 0, duplicateGroups: 0, needFill: 0, latestCreatedAt: '', syncedAt: 0 }

let cache = Object.assign({}, EMPTY)

/** 测试注入用 */
let LAN = null

function setEnv(opts) {
  if (opts && opts.lanservice) LAN = opts.lanservice
}

function lan() {
  if (!LAN) LAN = lanservice
  return LAN
}

/**
 * 筛选条件 → 查询串。参数名与电脑端 GET /api/invoices 一致，
 * 页面只传语义化的开关，映射集中在这里。
 *
 * batch 只给「查看这批票」用：批次号对用户是内部概念，不进界面文案，
 * 但收票页发完一批后仍然需要它把列表收敛到这一批。
 */
function buildQuery(filters) {
  const f = filters || {}
  const parts = []
  const keyword = String(f.keyword || '').trim()
  if (keyword) parts.push('keyword=' + encodeURIComponent(keyword))
  const batch = String(f.batch || '').trim()
  if (batch) parts.push('batch=' + encodeURIComponent(batch))
  // 录入时间按天比较，电脑端只取日期部分，这里传 YYYY-MM-DD
  const createdFrom = String(f.createdFrom || '').trim()
  if (createdFrom) parts.push('created_from=' + encodeURIComponent(createdFrom))
  const createdTo = String(f.createdTo || '').trim()
  if (createdTo) parts.push('created_to=' + encodeURIComponent(createdTo))
  if (f.onlyDuplicates) parts.push('only_duplicates=1')
  if (f.onlyNeedFill) parts.push('only_need_fill=1')
  parts.push('sort=' + (SORTS.indexOf(f.sort) >= 0 ? f.sort : 'created'))
  return parts.join('&')
}

/** 拉取并替换缓存，返回展示快照 */
function sync(filters) {
  return lan().fetchInvoices(buildQuery(filters)).then(function (data) {
    cache = {
      items: (data && data.items) || [],
      duplicates: (data && data.duplicates) || [],
      total: Number(data && data.total) || 0,
      duplicateGroups: Number(data && data.duplicate_groups) || 0,
      needFill: Number(data && data.need_fill) || 0,
      // 全表最新录入日期，不随 keyword/sort 筛选漂移，可当「最近一次录入」的回看入口。
      // 电脑端给的是 "2026-11-18 19:26:42"，界面和筛选都只用日期部分。
      latestCreatedAt: createdDate((data && data.latest_created_at) || ''),
      syncedAt: Date.now()
    }
    return snapshot()
  })
}

function clear() {
  cache = Object.assign({}, EMPTY)
}

/** 当前缓存的展示结构：卡片列表 + 汇总 */
function snapshot() {
  const items = cache.items
  let amount = 0
  const cards = items.map(function (item) {
    amount += Number(item.total) || 0
    return card(item)
  })
  return {
    items: cards,
    total: cache.total,
    amountText: amount.toFixed(2),
    duplicateGroups: cache.duplicateGroups,
    needFill: cache.needFill,
    latestCreatedAt: cache.latestCreatedAt,
    syncedAt: cache.syncedAt
  }
}

/** "2026-11-18 19:26:42" → "2026-11-18"；空值原样返回空串 */
function createdDate(value) {
  const text = String(value || '')
  const cut = text.indexOf(' ')
  return cut > 0 ? text.slice(0, cut) : text
}

/** 列表项 → 页面字段。金额是电脑端算好的字符串，原样展示 */
function card(item) {
  return {
    id: item.id,
    number: item.number || '',
    code: item.code || '',
    kind: item.kind || '',
    issueDate: item.issue_date || '',
    amount: item.total || '',
    reimburser: item.reimburser || '',
    createdAt: item.created_at || '',
    duplicate: !!item.duplicate,
    needFill: !!item.need_fill
  }
}

/** 判重索引：代码|号码 → 台账记录。同键保留最早那条，命中的是「原件」而不是后补的重复记录 */
function identityIndex() {
  const index = {}
  cache.items.forEach(function (item) {
    if (!item.number) return
    const key = (item.code || '') + '|' + item.number
    if (index[key]) return
    index[key] = item
  })
  return index
}

/** 扫码时用：这张草稿是否已经在电脑台账里 */
function findDuplicate(draft) {
  return identityIndex()[(draft.code || '') + '|' + (draft.number || '')] || null
}

function byId(id) {
  for (let i = 0; i < cache.items.length; i++) {
    if (Number(cache.items[i].id) === Number(id)) return cache.items[i]
  }
  return null
}

/** 同组重复记录（含自己），供详情页展示「还有哪几张一样」 */
function duplicateGroup(id) {
  const item = byId(id)
  if (!item) return []
  for (let i = 0; i < cache.duplicates.length; i++) {
    const group = cache.duplicates[i]
    if (group.number === item.number && (group.code || '') === (item.code || '')) {
      return group.items || []
    }
  }
  return []
}

module.exports = {
  SORTS: SORTS,
  setEnv: setEnv,
  buildQuery: buildQuery,
  sync: sync,
  clear: clear,
  snapshot: snapshot,
  card: card,
  identityIndex: identityIndex,
  findDuplicate: findDuplicate,
  byId: byId,
  duplicateGroup: duplicateGroup
}
