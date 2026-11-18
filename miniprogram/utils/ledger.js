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

const EMPTY = { items: [], duplicates: [], total: 0, duplicateGroups: 0, needFill: 0, syncedAt: 0 }

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
 */
function buildQuery(filters) {
  const f = filters || {}
  const parts = []
  const keyword = String(f.keyword || '').trim()
  if (keyword) parts.push('keyword=' + encodeURIComponent(keyword))
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
    syncedAt: cache.syncedAt
  }
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
    batch: item.batch || '',
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
