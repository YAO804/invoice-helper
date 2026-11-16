/**
 * M1 本地台账数据层
 *
 * 目录结构（都在 wx.env.USER_DATA_PATH 私有目录，不占 Storage 的 10MB 配额）：
 *
 *   invoices/
 *   ├── index.json              # 全局索引：id → 分片月份、去重键 → id
 *   ├── ledger/
 *   │   ├── 2026-08.json
 *   │   └── 2026-11.json
 *   └── files/                  # 原件，30 天 TTL，由 fsx.js 负责清理
 *
 * 金额一律用整数「分」存储，显示层再除 100。
 * Node 端测试可通过 setEnv({ root, fileSystem }) 注入内存文件系统。
 */

const category = require('./category')

const LEDGER_DIR = 'ledger'
const FILES_DIR = 'files'
const INDEX_NAME = 'index.json'

let FS = null
let ROOT = null

/** 测试注入用；小程序运行时不需要调用 */
function setEnv(opts) {
  if (opts.fileSystem) FS = opts.fileSystem
  if (opts.root) ROOT = opts.root
}

function fileSystem() {
  if (!FS) FS = wx.getFileSystemManager()
  return FS
}

function rootDir() {
  if (!ROOT) ROOT = wx.env.USER_DATA_PATH + '/invoices'
  return ROOT
}

function join() {
  return Array.prototype.slice.call(arguments).join('/')
}

function ensureDir(dir) {
  try {
    fileSystem().accessSync(dir)
    return true
  } catch (e) {}
  try {
    fileSystem().mkdirSync(dir, true)
    return true
  } catch (e2) {
    return false
  }
}

function readJson(path, fallback) {
  try {
    const s = fileSystem().readFileSync(path, 'utf8')
    return JSON.parse(s)
  } catch (e) {
    return fallback
  }
}

function writeJson(path, obj) {
  fileSystem().writeFileSync(path, JSON.stringify(obj))
}

function indexPath() { return join(rootDir(), INDEX_NAME) }
function ledgerPath(month) { return join(rootDir(), LEDGER_DIR, month + '.json') }

function freshIndex() {
  return { version: 1, nextId: 1, byKey: {}, idMonth: {}, updatedAt: Date.now() }
}

function init() {
  ensureDir(rootDir())
  ensureDir(join(rootDir(), LEDGER_DIR))
  ensureDir(join(rootDir(), FILES_DIR))

  let idx = readJson(indexPath(), null)
  if (!idx || idx.version !== 1 || !idx.byKey || !idx.idMonth) {
    idx = freshIndex()
    writeJson(indexPath(), idx)
    rebuildIndex()
  }
  return idx
}

const BASIS_KEY = 'ledger_basis'

/** 用户偏好：created=按导入时间，issued=按开票日期。默认 created。 */
function getBasis() {
  try { return wx.getStorageSync(BASIS_KEY) === 'issued' ? 'issued' : 'created' } catch (e) { return 'created' }
}

function setBasis(basis) {
  try { wx.setStorageSync(BASIS_KEY, basis === 'issued' ? 'issued' : 'created') } catch (e) {}
  return getBasis()
}

/** 物理分片始终按开票日期，这里只算「展示口径」的月份 */
function monthOf(inv) {
  const s = inv.issue_date || inv.created_at || ''
  return String(s).slice(0, 7) || 'unknown'
}

function createdMonth(inv) {
  const d = new Date(Number(inv.created_at))
  if (isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function groupMonth(inv, basis) {
  return basis === 'created' ? createdMonth(inv) : monthOf(inv)
}

function dedupeKey(inv) {
  return [inv.invoice_no || '', inv.issue_date || '', inv.total_cent || 0].join('|')
}

function shardFiles() {
  const dir = join(rootDir(), LEDGER_DIR)
  try {
    return fileSystem().readdirSync(dir).filter(function (n) { return /^\d{4}-\d{2}\.json$/.test(n) })
  } catch (e) {
    return []
  }
}

/** 从所有分片重建索引。台账丢失/索引损坏时的恢复入口。 */
function rebuildIndex() {
  const idx = freshIndex()
  shardFiles().forEach(function (name) {
    const month = name.replace(/\.json$/, '')
    const shard = readJson(ledgerPath(month), { invoices: [] })
    ;(shard.invoices || []).forEach(function (inv) {
      const id = Number(inv.id) || 0
      if (!id) return
      idx.idMonth[id] = month
      idx.byKey[dedupeKey(inv)] = id
      if (id >= idx.nextId) idx.nextId = id + 1
    })
  })
  idx.updatedAt = Date.now()
  writeJson(indexPath(), idx)
  return idx
}

function readShard(month) {
  return readJson(ledgerPath(month), { month: month, invoices: [] })
}

function writeShard(month, shard) {
  ensureDir(join(rootDir(), LEDGER_DIR))
  shard.month = month
  shard.updatedAt = Date.now()
  writeJson(ledgerPath(month), shard)
}

/** 列表查询。filter: { month, monthBasis, sortBy, seller, keyword, status, minCent, maxCent } */
function listInvoices(filter) {
  filter = filter || {}
  const basis = filter.monthBasis || 'issued'
  // 按导入月份筛选时不能只读写票月份的分片，必须全量读入再按 created_at 过滤
  const byImportedMonth = filter.month && basis === 'created'
  const months = filter.month && !byImportedMonth
    ? [filter.month]
    : shardFiles().map(function (n) { return n.replace(/\.json$/, '') })
  const all = []
  months.forEach(function (m) {
    const shard = readShard(m)
    ;(shard.invoices || []).forEach(function (inv) {
      if (byImportedMonth && groupMonth(inv, basis) !== filter.month) return
      all.push(inv)
    })
  })

  const kw = (filter.keyword || '').trim().toLowerCase()
  const seller = (filter.seller || '').trim().toLowerCase()

  const out = all.filter(function (inv) {
    if (filter.category && (inv.category || '未分类') !== filter.category) return false
    if (filter.status && inv.status !== filter.status) return false
    if (seller && String(inv.seller_name || '').toLowerCase().indexOf(seller) < 0) return false
    if (filter.minCent !== undefined && Number(inv.total_cent) < Number(filter.minCent)) return false
    if (filter.maxCent !== undefined && Number(inv.total_cent) > Number(filter.maxCent)) return false
    if (kw) {
      const hay = [
        inv.invoice_no, inv.seller_name, inv.buyer_name, inv.note,
        yuan(inv.total_cent), String(inv.total_cent),
        (inv.items || []).map(function (it) { return it.name }).join(' ')
      ].join(' ').toLowerCase()
      if (hay.indexOf(kw) < 0) return false
    }
    return true
  })

  const sortBy = filter.sortBy || 'issued'
  out.sort(function (a, b) {
    if (sortBy === 'created') {
      const ca = Number(a.created_at) || 0
      const cb = Number(b.created_at) || 0
      if (ca !== cb) return cb - ca
    } else {
      const da = String(a.issue_date || '')
      const db = String(b.issue_date || '')
      if (da !== db) return da < db ? 1 : -1
    }
    return Number(b.id || 0) - Number(a.id || 0)
  })
  return out
}

function getInvoice(id) {
  const idx = init()
  const month = idx.idMonth[id]
  const candidates = month ? [month] : shardFiles().map(function (n) { return n.replace(/\.json$/, '') })
  for (let i = 0; i < candidates.length; i++) {
    const list = readShard(candidates[i]).invoices || []
    for (let j = 0; j < list.length; j++) {
      if (Number(list[j].id) === Number(id)) return list[j]
    }
  }
  return null
}

function findDuplicate(inv) {
  const idx = init()
  const id = idx.byKey[dedupeKey(inv)]
  return id ? getInvoice(id) : null
}

function normalize(inv, idx) {
  const now = Date.now()
  const out = Object.assign({}, inv)
  out.id = Number(inv.id) || idx.nextId
  out.invoice_no = out.invoice_no || ''
  out.invoice_code = out.invoice_code || ''
  out.issue_date = out.issue_date || ''
  out.status = out.status || 'unknown'
  out.category = out.category || '未分类'
  out.source = out.source || 'manual'
  out.confidence = out.confidence === undefined ? 1 : out.confidence
  out.qr_integrity = out.qr_integrity || 'n/a'
  out.raw_qr = out.raw_qr || ''
  out.anomaly = out.anomaly || []
  out.edited_fields = out.edited_fields || []
  out.files = out.files || []
  out.items = out.items || []
  out.note = out.note || ''
  out.amount_excl_tax_cent = Number(out.amount_excl_tax_cent) || 0
  out.tax_cent = Number(out.tax_cent) || 0
  out.total_cent = Number(out.total_cent) || 0
  out.created_at = out.created_at || now
  out.updated_at = now
  return out
}

/** 新增或更新一条台账，返回落盘后的记录 */
function upsertInvoice(data) {
  const idx = init()
  const inv = normalize(data, idx)
  const month = monthOf(inv)

  // 改了开票日期可能跨月：先把旧分片里的同一条移走，否则两个分片各留一份
  const oldMonth = idx.idMonth[inv.id]
  if (oldMonth && oldMonth !== month) {
    const oldShard = readShard(oldMonth)
    oldShard.invoices = (oldShard.invoices || []).filter(function (x) { return Number(x.id) !== Number(inv.id) })
    writeShard(oldMonth, oldShard)
  }

  const shard = readShard(month)
  shard.invoices = shard.invoices || []
  let replaced = false
  for (let i = 0; i < shard.invoices.length; i++) {
    if (Number(shard.invoices[i].id) === Number(inv.id)) {
      shard.invoices[i] = inv
      replaced = true
      break
    }
  }
  if (!replaced) shard.invoices.push(inv)
  writeShard(month, shard)

  // 旧 key 可能因为编辑而失效，全表清掉该 id 的残留再写新 key
  Object.keys(idx.byKey).forEach(function (k) {
    if (idx.byKey[k] === inv.id) delete idx.byKey[k]
  })
  idx.byKey[dedupeKey(inv)] = inv.id
  idx.idMonth[inv.id] = month
  if (inv.id >= idx.nextId) idx.nextId = inv.id + 1
  idx.updatedAt = Date.now()
  writeJson(indexPath(), idx)

  return inv
}

function deleteInvoice(id) {
  const idx = init()
  const month = idx.idMonth[id]
  if (!month) return false
  const shard = readShard(month)
  const before = (shard.invoices || []).length
  shard.invoices = (shard.invoices || []).filter(function (inv) { return Number(inv.id) !== Number(id) })
  if (shard.invoices.length === before) return false
  writeShard(month, shard)

  Object.keys(idx.byKey).forEach(function (k) {
    if (idx.byKey[k] === Number(id)) delete idx.byKey[k]
  })
  delete idx.idMonth[id]
  idx.updatedAt = Date.now()
  writeJson(indexPath(), idx)
  return true
}

function monthStats(month, basis) {
  const list = listInvoices({ month: month, monthBasis: basis })
  return {
    month: month,
    count: list.length,
    totalCent: list.reduce(function (s, inv) { return s + (Number(inv.total_cent) || 0) }, 0),
    taxCent: list.reduce(function (s, inv) { return s + (Number(inv.tax_cent) || 0) }, 0)
  }
}

/** 现有月份列表，倒序。basis='created' 时按导入时间归月 */
function months(basis) {
  if (!basis || basis === 'issued') {
    return shardFiles().map(function (n) { return n.replace(/\.json$/, '') }).sort().reverse()
  }
  const set = {}
  shardFiles().forEach(function (name) {
    const shard = readShard(name.replace(/\.json$/, ''))
    ;(shard.invoices || []).forEach(function (inv) {
      const m = createdMonth(inv)
      if (m) set[m] = 1
    })
  })
  return Object.keys(set).sort().reverse()
}

/** 待复核：有异常标记，或还没有发票号码的草稿 */
function reviewList() {
  return listInvoices({ sortBy: getBasis() }).filter(function (inv) {
    return !inv.invoice_no || (inv.anomaly || []).length > 0
  })
}

/* ---------- 换算与结构化 ---------- */

/** 金额字符串 → 整数分。保留原始精度到分，不做浮点累加。 */
function toCents(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

function yuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

/** 离线勾稽校验。只标异常，不做真伪判断。 */
function validate(inv) {
  const out = []
  const total = Number(inv.total_cent) || 0
  const excl = Number(inv.amount_excl_tax_cent) || 0
  const tax = Number(inv.tax_cent) || 0
  if (excl + tax !== total) out.push('金额勾稽不符：不含税 ' + yuan(excl) + ' + 税额 ' + yuan(tax) + ' ≠ 价税合计 ' + yuan(total))

  const items = inv.items || []
  if (items.length) {
    const sum = items.reduce(function (s, it) { return s + (Number(it.amount_cent) || 0) }, 0)
    if (sum !== excl) out.push('明细金额合计 ' + yuan(sum) + ' ≠ 不含税金额 ' + yuan(excl))
  }
  const no = String(inv.invoice_no || '')
  if (no && no.length !== 8 && no.length !== 20) out.push('发票号码位数异常：' + no.length + ' 位')
  return out
}

/** extractInvoice() 的结果 → 台账记录（尚未落盘） */
function fromParsed(parsed, extra) {
  if (!parsed || !parsed.ok) return null
  extra = extra || {}
  const items = (parsed.items || []).map(function (it, i) {
    return {
      line_no: i + 1,
      name: it.name || '',
      spec: '',
      unit: '',
      quantity: 1,
      unit_price_cent: 0,
      amount_cent: toCents(it.amount),
      tax_rate: it.taxRate || null,
      tax_cent: toCents(it.tax),
      total_cent: toCents(it.withTax)
    }
  })
  const inv = {
    invoice_no: parsed.invoiceNo || '',
    invoice_code: '',
    invoice_type: parsed.typeLabel || '数电票',
    issue_date: (parsed.issueTime || '').slice(0, 10),
    seller_name: (parsed.seller && parsed.seller.name) || '',
    seller_tax_id: (parsed.seller && parsed.seller.idNum) || '',
    buyer_name: (parsed.buyer && parsed.buyer.name) || '',
    buyer_tax_id: (parsed.buyer && parsed.buyer.idNum) || '',
    amount_excl_tax_cent: toCents(parsed.amount && parsed.amount.withoutTax),
    tax_cent: toCents(parsed.amount && parsed.amount.tax),
    total_cent: toCents(parsed.amount && parsed.amount.withTax),
    tax_rate: items.length ? items[0].tax_rate : null,
    category: category.guess(items[0] && items[0].name, items, parsed.seller && parsed.seller.name),
    source: extra.source || 'xml',
    confidence: 1,
    files: extra.files || [],
    items: items,
    note: '',
    // 原始解析附带的结构，留给详情页展示，不参与勾稽
    meta: {
      eiid: parsed.eiid,
      version: parsed.version,
      tag: parsed.tag,
      labels: parsed.labels,
      is_blue: parsed.isBlue,
      drawer: parsed.drawer,
      signature: parsed.signature,
      seller_detail: parsed.seller,
      amount_cn: parsed.amount && parsed.amount.withTaxCN
    }
  }
  inv.anomaly = validate(inv)
  return inv
}

/** parseLegacyQr() 的结果 → 草稿记录。字段不全，confidence 低于 XML。 */
function fromQr(qr, extra) {
  if (!qr || !qr.invoiceNo) return null
  extra = extra || {}
  const inv = {
    invoice_no: qr.invoiceNo,
    invoice_code: qr.invoiceCode || '',
    invoice_type: qr.invoiceType || '未知票种',
    issue_date: String(qr.issueDate || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    seller_name: '',
    seller_tax_id: '',
    buyer_name: '',
    buyer_tax_id: '',
    amount_excl_tax_cent: 0,
    tax_cent: 0,
    total_cent: toCents(qr.amount),
    tax_rate: null,
    category: '未分类',
    source: 'qr',
    confidence: 0.8,
    raw_qr: extra.raw || '',
    qr_integrity: 'n/a',
    items: [],
    files: [],
    note: '扫码草稿：销方/税额/明细待补录'
  }
  // 扫码本来就只有号码/金额/日期，不该报「金额勾稽不符」吓人
  inv.anomaly = ['扫码草稿：不含销方、税额与明细，字段待补录']
  return inv
}

module.exports = {
  setEnv: setEnv,
  getBasis: getBasis,
  setBasis: setBasis,
  groupMonth: groupMonth,
  init: init,
  rebuildIndex: rebuildIndex,
  listInvoices: listInvoices,
  getInvoice: getInvoice,
  findDuplicate: findDuplicate,
  upsertInvoice: upsertInvoice,
  deleteInvoice: deleteInvoice,
  monthStats: monthStats,
  months: months,
  reviewList: reviewList,
  toCents: toCents,
  yuan: yuan,
  validate: validate,
  fromParsed: fromParsed,
  fromQr: fromQr
}
