/**
 * 数电票 XML 解析 + 二维码解析
 *
 * 本文件的字段路径全部来自真机读取的真实数电票 XML（S3，2026-08-02 开具，
 * 发票号码 26932000001295659876，共 63 个标签），不是从公开资料猜的。
 *
 * 三个必须按「完整路径」取值、不能用标签名模糊匹配的坑：
 *
 *   1. 合计行价税合计是 TotalTax-includedAmount（带连字符），在 BasicInformation 下；
 *      明细行价税合计是 TotaltaxIncludedAmount（小写 t，无连字符），在 IssuItemInformation 下。
 *      两者只差大小写和连字符，且单行明细时数值恰好相等——用模糊匹配会取错而不报错。
 *
 *   2. 开票日期 IssueTime 在 TaxSupervisionInfo 下；BasicInformation 里只有 RequestTime
 *      （申请开票时间）。二者语义不同，混用会导致「开票日期」写成申请时间。
 *
 *   3. GeneralOrSpecialVAT 是容器节点，票种名在其子节点 LabelName 里。
 *      直接取容器文本会拿到 "<LabelCode>02</LabelCode><LabelName>普通发票</LabelName>" 这段 XML。
 *
 * 另外两点：
 *   4. 个人抬头的 BuyerInformation 下没有 BuyerIdNum 节点，缺失属正常，不进 missing 告警。
 *   5. InIssuType 的 LabelName 是字段名「是否蓝字发票标志」，Y/N 才是值——不能直接把
 *      LabelName 当成票面状态展示，用 extractInvoice 返回的 isBlue。
 *
 * 金额一律保留原始字符串，不做 parseFloat 求和，避免浮点误差污染账目。
 */

/* ============================ XML 迷你解析器 ============================ */

const TAG_RE = /<(\/?)([A-Za-z_][\w.:\-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (all, body) {
      if (body.charAt(0) === '#') {
        const code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
        return isNaN(code) ? all : String.fromCharCode(code)
      }
      return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : all
    })
}

function parseAttrs(raw) {
  const attrs = {}
  if (!raw) return attrs
  const re = /([\w.:\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(raw))) attrs[m[1]] = m[2] !== undefined ? m[2] : m[3]
  return attrs
}

/**
 * 极简 XML 树解析。只处理数电票 XML 实际用到的语法：
 * 元素、属性、自闭合、CDATA、实体。不处理命名空间前缀校验、DTD。
 * 返回虚拟根节点 { name:'#root', children:[...] }。
 */
function parseXml(src) {
  const text = String(src).replace(/^\uFEFF/, '')
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  let last = 0
  let m

  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(text))) {
    const cur = stack[stack.length - 1]
    if (m.index > last) cur.text += decodeEntities(text.slice(last, m.index))
    last = TAG_RE.lastIndex

    const name = m[2]

    if (m[1] === '/') {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].name === name) { stack.length = i; break }
      }
      continue
    }

    const node = { name: name, attrs: parseAttrs(m[3]), children: [], text: '' }
    cur.children.push(node)
    if (m[4] !== '/') stack.push(node)
  }

  return root
}

/** 取某个节点的全部直属同名子节点 */
function childrenNamed(node, name) {
  const out = []
  if (!node || !node.children) return out
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].name === name) out.push(node.children[i])
  }
  return out
}

/**
 * 按完整路径取所有命中节点。
 * 路径形如 'EInvoice/EInvoiceData/IssuItemInformation/ItemName'，
 * 中间层可重复（多明细行时会命中多份）。
 */
function getAll(root, path) {
  const parts = String(path).split('/').filter(Boolean)
  let cur = [root]
  for (let i = 0; i < parts.length; i++) {
    const next = []
    for (let j = 0; j < cur.length; j++) {
      const hits = childrenNamed(cur[j], parts[i])
      for (let k = 0; k < hits.length; k++) next.push(hits[k])
    }
    cur = next
    if (!cur.length) return []
  }
  return cur
}

/** 按完整路径取第一个节点 */
function getNode(root, path) {
  const list = getAll(root, path)
  return list.length ? list[0] : null
}

/** 节点的全部文本（含后代），已去实体与首尾空白 */
function flatText(node) {
  if (!node) return ''
  if (node.text) return node.text.replace(/\s+/g, ' ').trim()
  let s = ''
  for (let i = 0; i < node.children.length; i++) s += flatText(node.children[i])
  return s.replace(/\s+/g, ' ').trim()
}

/** 按完整路径取文本；缺失返回 null（不是空串，便于区分「字段不存在」与「字段为空」） */
function getText(root, path) {
  const node = getNode(root, path)
  if (!node) return null
  const v = flatText(node)
  return v === '' ? null : v
}

/* ============================ 标签树 dump（M0 诊断用） ============================ */

/** 按标签名逐层还原路径，输出 { '路径': 出现次数 } */
function dumpTags(text) {
  const re = /<(\/?)([A-Za-z_][\w.:\-]*)([^>]*?)(\/?)>/g
  const counts = {}
  const stack = []
  let m
  while ((m = re.exec(text))) {
    const closing = m[1] === '/'
    const name = m[2]
    const selfClose = m[4] === '/'
    if (closing) {
      const i = stack.lastIndexOf(name)
      if (i >= 0) stack.length = i
      continue
    }
    const path = stack.concat(name).join('/')
    counts[path] = (counts[path] || 0) + 1
    if (!selfClose) stack.push(name)
  }
  return counts
}

/** dumpTags 的数组形式，按路径排序，便于直接看 */
function dumpTagList(text) {
  const map = dumpTags(text)
  return Object.keys(map)
    .map(function (k) { return { path: k, count: map[k] } })
    .sort(function (a, b) { return a.path < b.path ? -1 : 1 })
}

/* ============================ 编码探测 ============================ */

function peekText(bytes, n) {
  let s = ''
  const max = Math.min(n || 400, bytes.length)
  for (let i = 0; i < max; i++) s += String.fromCharCode(bytes[i])
  return s
}

function detectEncoding(bytes) {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const head = peekText(bytes, 400)
  const declared = (head.match(/encoding\s*=\s*["']([^"']+)["']/i) || [])[1] || null
  let readEncoding = 'utf-8'
  let note = ''
  if (declared && /gb2312|gbk|gb18030/i.test(declared)) {
    note = '声明编码为 ' + declared + '，小程序 readFile 不支持 GBK，此处按 utf-8 读取，中文会乱码。需另做转码方案。'
  } else if (bom) {
    note = '带 UTF-8 BOM，读取时首字符可能出现 \\uFEFF，需要 strip。'
  }
  return { bom: bom, declared: declared, readEncoding: readEncoding, note: note }
}

/* ============================ 数电票字段抽取 ============================ */

/** 固有标签：四个都长这样 { LabelCode, LabelName } */
const LABEL_GROUPS = [
  { key: 'eInvoiceType', path: 'EInvoice/Header/InherentLabel/EInvoiceType', desc: '数电票类型' },
  { key: 'vatType', path: 'EInvoice/Header/InherentLabel/GeneralOrSpecialVAT', desc: '增普/增专' },
  // 实测：LabelName 是字段名「是否蓝字发票标志」，真正的值在 LabelCode：Y=蓝字 / N=红字
  { key: 'issuType', path: 'EInvoice/Header/InherentLabel/InIssuType', desc: '是否蓝字（Y/N）' },
  { key: 'taxpayerType', path: 'EInvoice/Header/InherentLabel/TaxpayerType', desc: '纳税人类型' }
]

function readLabels(root) {
  const out = {}
  const missing = []
  for (let i = 0; i < LABEL_GROUPS.length; i++) {
    const g = LABEL_GROUPS[i]
    const code = getText(root, g.path + '/LabelCode')
    const name = getText(root, g.path + '/LabelName')
    if (name || code) {
      out[g.key] = { code: code, name: name, desc: g.desc }
    } else {
      missing.push(g.path + '/LabelName')
    }
  }
  return { labels: out, missing: missing }
}

/** 签名算法 OID → 可读名。实测值 1.2.156.10197.1.501 = SM2 */
const SIG_ALGOS = {
  '1.2.156.10197.1.501': 'SM2',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA'
}

/** InIssuType 的 LabelCode 是 Y/N，LabelName 只是字段名，不能直接当票面状态展示 */
function isBlueInvoice(labels) {
  const issu = labels.issuType
  if (!issu) return null
  const code = (issu.code || '').toUpperCase()
  if (code === 'Y' || code === '1') return true
  if (code === 'N' || code === '0') return false
  return null
}

function readItems(root) {
  const names = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/ItemName')
  if (!names.length) return []
  const codes = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/TaxClassificationCode')
  const rates = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/TaxRate')
  const amounts = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/Amount')
  const taxes = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/ComTaxAm')
  const totals = getAll(root, 'EInvoice/EInvoiceData/IssuItemInformation/TotaltaxIncludedAmount')

  return names.map(function (n, i) {
    return {
      name: flatText(n),
      taxCode: codes[i] ? flatText(codes[i]) : null,
      taxRate: rates[i] ? flatText(rates[i]) : null,
      amount: amounts[i] ? flatText(amounts[i]) : null,
      tax: taxes[i] ? flatText(taxes[i]) : null,
      withTax: totals[i] ? flatText(totals[i]) : null
    }
  })
}

/**
 * 抽取数电票字段。
 * @returns {ok, reason?, ...} ok=false 表示这份 XML 不是数电票结构
 */
function extractInvoice(text) {
  const root = parseXml(text)

  const invoiceNo = getText(root, 'EInvoice/TaxSupervisionInfo/InvoiceNumber')
  const eiid = getText(root, 'EInvoice/Header/EIid')
  if (!invoiceNo && !eiid) {
    return {
      ok: false,
      reason: '未找到 EInvoice/TaxSupervisionInfo/InvoiceNumber 或 EInvoice/Header/EIid，可能不是数电票 XML',
      rootTag: root.children.length ? root.children[0].name : null
    }
  }

  const labelResult = readLabels(root)
  const items = readItems(root)

  const invoice = {
    ok: true,
    invoiceNo: invoiceNo,
    eiid: eiid,
    version: getText(root, 'EInvoice/Header/Version'),
    tag: getText(root, 'EInvoice/Header/EInvoiceTag'),

    issueTime: getText(root, 'EInvoice/TaxSupervisionInfo/IssueTime'),
    requestTime: getText(root, 'EInvoice/EInvoiceData/BasicInformation/RequestTime'),

    labels: labelResult.labels,
    // 票种短名：优先取「普通发票/专用发票」这一层，这是账目分类最常用的口径
    typeLabel: labelResult.labels.vatType ? labelResult.labels.vatType.name : null,
    // 实测 InIssuType.LabelName 是「是否蓝字发票标志」，展示要用归一化后的布尔值
    isBlue: isBlueInvoice(labelResult.labels),

    seller: {
      name: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerName'),
      idNum: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerIdNum'),
      addr: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerAddr'),
      tel: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerTelNum'),
      bankName: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerBankName'),
      bankAcc: getText(root, 'EInvoice/EInvoiceData/SellerInformation/SellerBankAccNum')
    },

    buyer: {
      name: getText(root, 'EInvoice/EInvoiceData/BuyerInformation/BuyerName'),
      // 个人抬头没有这个节点，属正常
      idNum: getText(root, 'EInvoice/EInvoiceData/BuyerInformation/BuyerIdNum')
    },

    amount: {
      // 带连字符，且在 BasicInformation 下
      withTax: getText(root, 'EInvoice/EInvoiceData/BasicInformation/TotalTax-includedAmount'),
      withTaxCN: getText(root, 'EInvoice/EInvoiceData/BasicInformation/TotalTax-includedAmountInChinese'),
      withoutTax: getText(root, 'EInvoice/EInvoiceData/BasicInformation/TotalAmWithoutTax'),
      tax: getText(root, 'EInvoice/EInvoiceData/BasicInformation/TotalTaxAm')
    },

    drawer: getText(root, 'EInvoice/EInvoiceData/BasicInformation/Drawer'),
    items: items,
    itemCount: items.length,

    signature: {
      present: !!getNode(root, 'EInvoice/TaxBureauSignature'),
      algorithm: getText(root, 'EInvoice/TaxBureauSignature/SignatureAlgorithm'),
      algorithmName: SIG_ALGOS[getText(root, 'EInvoice/TaxBureauSignature/SignatureAlgorithm')] || null,
      format: getText(root, 'EInvoice/TaxBureauSignature/SignatureFormat'),
      detached: getText(root, 'EInvoice/TaxBureauSignature/SignatureFormat') === 'DETACH',
      time: getText(root, 'EInvoice/TaxBureauSignature/SignatureTime'),
      valueLength: (getText(root, 'EInvoice/TaxBureauSignature/SignatureValue') || '').length
    },

    sellerAuth: getText(root, 'EInvoice/SellerAuthentication/AuthenticationMethods'),

    // 必填项里没取到的，用于自检。buyer.idNum 不算必填，故不列入。
    missing: []
  }

  const required = {
    '发票号码': invoice.invoiceNo,
    '开票日期': invoice.issueTime,
    '销方名称': invoice.seller.name,
    '价税合计': invoice.amount.withTax,
    '不含税金额': invoice.amount.withoutTax,
    '税额': invoice.amount.tax
  }
  Object.keys(required).forEach(function (k) {
    if (!required[k]) invoice.missing.push(k)
  })
  if (!invoice.items.length) invoice.missing.push('明细行')
  invoice.missing = invoice.missing.concat(labelResult.missing)

  return invoice
}

/* ============================ 二维码 ============================ */

/** 二维码类型判别 */
function classifyQr(raw) {
  if (!raw) return 'empty'
  if (/^https?:\/\//i.test(raw)) return 'url'
  if (/^\d{2},/.test(raw) && raw.indexOf(',') > 0) return 'legacy-csv'
  if (raw.indexOf(',') > 0 && raw.split(',').length >= 8) return 'legacy-csv'
  return 'unknown'
}

/**
 * 二维码明文串：版本,票种,代码,号码,金额,日期,校验码,CRC
 *
 * 真实样本（真机扫数电票）：
 *   01,31,,26932000001877489821,10500.00,20261110,,277D
 *
 * 关键事实：数电票二维码同样是明文串，不是加密链接。可直接读出
 * 发票号码、价税合计、开票日期——扫码因此成为可行的主入口。
 * 票种码 31 对应数电票；发票代码与校验码为空。
 *
 * 注意：二维码只带号码/金额/日期，没有销方名称、没有明细，
 * 所以扫码只能用来「快速建一条待补全的草稿」，不能替代 XML。
 */
function parseLegacyQr(raw) {
  const p = String(raw || '').split(',')
  if (p.length < 8) return null
  const invoiceCode = (p[2] || '').trim()
  const invoiceNo = (p[3] || '').trim()
  return {
    version: p[0],
    typeCode: p[1],
    invoiceCode: invoiceCode,
    invoiceNo: invoiceNo,
    amount: p[4],
    issueDate: p[5],
    checkCode: (p[6] || '').trim(),
    crcDeclared: (p[7] || '').trim().toUpperCase(),
    invoiceType: guessInvoiceType(p[1], invoiceNo, invoiceCode),
    crcNote: 'CRC 算法未公开：用真实样本枚举 70 组标准 CRC-16 变体均未命中，故仅保留原值，不作校验'
  }
}

/** 依据票种码与发票号码推断票种（基于 GB/T 附录 D 与真机样本） */
function guessInvoiceType(typeCode, invoiceNo, invoiceCode) {
  const no = invoiceNo || ''
  const code = invoiceCode || ''
  if (no.length === 20) {
    const ch5 = no.charAt(4)
    if (ch5 === '8') return '航空运输电子客票行程单'
    if (ch5 === '9') return '铁路电子客票'
    return '数电票'
  }
  if (typeCode === '10') return '增值税电子普通发票'
  if (typeCode === '20') return '增值税电子专用发票'
  if (typeCode === '31') return '数电票'
  if (code.length === 12) return '增值税电子发票'
  return '未知票种'
}

module.exports = {
  parseXml: parseXml,
  getAll: getAll,
  getNode: getNode,
  getText: getText,
  flatText: flatText,
  peekText: peekText,
  detectEncoding: detectEncoding,
  dumpTags: dumpTags,
  dumpTagList: dumpTagList,
  extractInvoice: extractInvoice,
  classifyQr: classifyQr,
  parseLegacyQr: parseLegacyQr,
  guessInvoiceType: guessInvoiceType
}
