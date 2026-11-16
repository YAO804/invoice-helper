/**
 * ZIP / OFD 结构探测
 *
 * 目的：在不引入任何解压库的前提下，先确认「OFD 就是 ZIP」这个前提成立，
 * 并列出内部条目名。如果能看到 Content.xml / OFD.xml，说明后续用 pako
 * 解压读取文本层的方案可行。
 */

function headHex(bytes, n) {
  const out = []
  const max = Math.min(n || 16, bytes.length)
  for (let i = 0; i < max; i++) out.push(bytes[i].toString(16).padStart(2, '0'))
  return out.join(' ')
}

function isZip(bytes) {
  if (bytes.length < 4) return false
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  return (bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06)
}

function u16(b, i) { return b[i] | (b[i + 1] << 8) }
function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 }

/** 从 EOCD 定位中央目录，逐条读出条目名与解压后大小 */
function readEntries(bytes) {
  let eocd = -1
  const start = Math.max(0, bytes.length - 66000)
  for (let i = bytes.length - 22; i >= start; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return { ok: false, reason: '找不到 ZIP 结束标记（EOCD）' }

  const declaredCount = u16(bytes, eocd + 10)
  let off = u32(bytes, eocd + 16)
  const entries = []
  let guard = 0

  while (guard++ < declaredCount + 16 && off + 46 <= bytes.length) {
    if (!(bytes[off] === 0x50 && bytes[off + 1] === 0x4b && bytes[off + 2] === 0x01 && bytes[off + 3] === 0x02)) break
    const nameLen = u16(bytes, off + 28)
    const extraLen = u16(bytes, off + 30)
    const commentLen = u16(bytes, off + 32)
    const unpacked = u32(bytes, off + 24)
    const packed = u32(bytes, off + 20)

    let name = ''
    for (let j = 0; j < nameLen; j++) name += String.fromCharCode(bytes[off + 46 + j])
    entries.push({ name: name, size: unpacked, packedSize: packed })

    off += 46 + nameLen + extraLen + commentLen
  }

  return { ok: true, declaredCount: declaredCount, entries: entries }
}

function inspect(bytes) {
  const zip = isZip(bytes)
  const result = {
    headHex: headHex(bytes, 16),
    isZip: zip,
    totalBytes: bytes.length
  }
  if (!zip) {
    result.reason = '文件头不是 PK\\x03\\x04，不是 ZIP 容器。若为 .ofd 则说明该文件结构异常。'
    return result
  }
  const r = readEntries(bytes)
  if (!r.ok) {
    result.reason = r.reason
    return result
  }
  result.declaredCount = r.declaredCount
  result.entryCount = r.entries.length
  result.entries = r.entries
  const names = r.entries.map(function (e) { return e.name })
  const has = function (re) { return names.some(function (n) { return re.test(n) }) }

  result.hasContentXml = has(/Content\.xml$/i)
  result.hasOfdXml = has(/(^|\/)OFD\.xml$/i)

  /*
   * S4 真机样本修正（26932000001295659876_宁波顺渝餐饮管理有限公司_....ofd）：
   * 真实税务 OFD 里没有 Doc_0/Signs/，电子印章放在
   *   Doc_0/Annots/Annotations.xml
   *   Doc_0/Annots/Page_0/Annotation.xml
   * 业务标记放在 Doc_0/Tags/CustomTag.xml、CustomTags.xml。
   * 所以「没有 Signs/」不能再当 SignatureMissing 判断。
   */
  result.hasDocSignature = has(/(^|\/)Signs\//i)      // OFD 文档级电子签名
  result.hasAnnotation = has(/(^|\/)Annots\//i)       // 页级注释，通常是电子印章
  result.hasCustomTags = has(/(^|\/)Tags\//i)         // 票面业务标记
  result.hasTpl = has(/(^|\/)Tpls\//i)

  // 保留旧字段名以兼容已有调用方，但语义换成「存在任一签章线索」
  result.hasSigns = result.hasDocSignature || result.hasAnnotation
  result.signatureHints = []
  if (result.hasDocSignature) result.signatureHints.push('Doc_0/Signs/（文档级签名）')
  if (result.hasAnnotation) result.signatureHints.push('Doc_0/Annots/（页级注释/电子印章）')
  if (result.hasCustomTags) result.signatureHints.push('Doc_0/Tags/（业务标记）')

  result.hint = result.hasContentXml
    ? '结构正常，Content.xml 存在。下一步：引入 pako 解压并抽取 TextCode 文本。'
    : '未发现 Content.xml，该文件可能不是标准 OFD 版式文件。'
  return result
}

module.exports = {
  inspect: inspect,
  isZip: isZip,
  headHex: headHex
}
