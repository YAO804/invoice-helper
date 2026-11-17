/**
 * zip.js 回归测试
 *
 * 用手工构造的 ZIP 验证中央目录读取；
 * 第二份按 S4 真机样本结构构造：无 Doc_0/Signs/，印章在 Annots/ 下。
 *
 *   node test/miniprogram/zip.test.js
 */

const zlib = require('zlib')
const zipx = require('../../miniprogram/utils/zip')

let failCount = 0
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failCount++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name +
    (ok ? '' : '\n      期望 ' + JSON.stringify(expected) + '\n      实际 ' + JSON.stringify(actual)))
}

let table = null
function crc32(buf) {
  if (!table) {
    table = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      table[i] = c
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function makeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  entries.forEach(function (e) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const data = Buffer.from(e.data, 'utf8')
    const comp = zlib.deflateRawSync(data)
    const crc = crc32(data)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(8, 8)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)

    chunks.push(lh, nameBuf, comp)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(8, 10)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([cd, nameBuf]))

    offset += lh.length + nameBuf.length + comp.length
  })

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat(chunks.concat([cdBuf, eocd]))
}

console.log('--- 通用 ZIP（带 Doc_0/Signs/）---')
const oldStyle = zipx.inspect(new Uint8Array(makeZip([
  { name: 'OFD.xml', data: '<ofd:OFD/>' },
  { name: 'Doc_0/Document.xml', data: '<Document><Pages>1</Pages></Document>' },
  { name: 'Doc_0/Pages/Page_0/Content.xml', data: '<Content><TextCode>滴滴出行 38.50</TextCode></Content>' },
  { name: 'Doc_0/Signs/Sign_0/SignedValue.dat', data: 'signature-bytes' }
])))
check('识别为 ZIP', oldStyle.isZip, true)
check('条目数', oldStyle.entryCount, 4)
check('有 OFD.xml', oldStyle.hasOfdXml, true)
check('有 Content.xml', oldStyle.hasContentXml, true)
check('有文档级签名', oldStyle.hasDocSignature, true)
check('hasSigns 兼容字段', oldStyle.hasSigns, true)

console.log('\n--- S4 真机结构（无 Signs/，印章在 Annots/）---')
const realStyle = zipx.inspect(new Uint8Array(makeZip([
  { name: 'OFD.xml', data: '<ofd:OFD/>' },
  { name: 'Doc_0/Document.xml', data: '<Document/>' },
  { name: 'Doc_0/Pages/Page_0/Content.xml', data: '<Content><TextCode>宁波顺渝餐饮管理有限公司</TextCode></Content>' },
  { name: 'Doc_0/Annots/Annotations.xml', data: '<Annotations/>' },
  { name: 'Doc_0/Annots/Page_0/Annotation.xml', data: '<Annotation type="Seal"/>' },
  { name: 'Doc_0/Tags/CustomTag.xml', data: '<CustomTag/>' },
  { name: 'Doc_0/Tags/CustomTags.xml', data: '<CustomTags/>' },
  { name: 'Doc_0/Tpls/Tpl_0/Content.xml', data: '<Content/>' }
])))
check('无文档级签名目录', realStyle.hasDocSignature, false)
check('检出 Annots 注释', realStyle.hasAnnotation, true)
check('检出 Tags 业务标记', realStyle.hasCustomTags, true)
check('检出模板', realStyle.hasTpl, true)
check('hasSigns 仍然为 true（不能误判为无签章）', realStyle.hasSigns, true)
check('签章线索条数（Annots + Tags，无文档级签名）', realStyle.signatureHints.length, 2)

console.log('\n--- PDF 输入（S4 实测）---')
const pdf = zipx.inspect(new Uint8Array(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1')))
check('不是 ZIP', pdf.isZip, false)
check('给出原因', typeof pdf.reason === 'string', true)

console.log('\n' + (failCount === 0 ? '全部通过' : failCount + ' 项失败'))
process.exit(failCount === 0 ? 0 : 1)
