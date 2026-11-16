/**
 * 用真实样本校准二维码 CRC16 参数
 *
 * 样本（真机扫描，2026-11-16）：
 *   01,31,,26932000001877489821,10500.00,20261110,,277D
 *   期望 CRC = 0x277D
 *
 * 遍历常见 CRC-16 变体 × 多种载荷边界，输出所有命中组合。
 *
 *   node scripts/calibrate-crc.js
 */

function reflect8(b) {
  let r = 0
  for (let i = 0; i < 8; i++) { r = (r << 1) | (b & 1); b >>= 1 }
  return r & 0xff
}

function reflect16(v) {
  let r = 0
  for (let i = 0; i < 16; i++) { r = (r << 1) | (v & 1); v >>= 1 }
  return r & 0xffff
}

function crc16(bytes, p) {
  let crc = p.init
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i]
    if (p.refin) b = reflect8(b)
    crc ^= b << 8
    for (let k = 0; k < 8; k++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ p.poly) : (crc << 1)
      crc &= 0xffff
    }
  }
  if (p.refout) crc = reflect16(crc)
  return (crc ^ p.xorout) & 0xffff
}

const VARIANTS = [
  { name: 'ARC/IBM',      poly: 0x8005, init: 0x0000, refin: true,  refout: true,  xorout: 0x0000 },
  { name: 'MODBUS',       poly: 0x8005, init: 0xffff, refin: true,  refout: true,  xorout: 0x0000 },
  { name: 'USB',          poly: 0x8005, init: 0xffff, refin: true,  refout: true,  xorout: 0xffff },
  { name: 'MAXIM',        poly: 0x8005, init: 0x0000, refin: true,  refout: true,  xorout: 0xffff },
  { name: 'BUYPASS',      poly: 0x8005, init: 0x0000, refin: false, refout: false, xorout: 0x0000 },
  { name: 'DDS-110',      poly: 0x8005, init: 0x800d, refin: false, refout: false, xorout: 0x0000 },
  { name: 'CMS',          poly: 0x8005, init: 0xffff, refin: false, refout: false, xorout: 0x0000 },
  { name: 'CCITT-FALSE',  poly: 0x1021, init: 0xffff, refin: false, refout: false, xorout: 0x0000 },
  { name: 'XMODEM',       poly: 0x1021, init: 0x0000, refin: false, refout: false, xorout: 0x0000 },
  { name: 'KERMIT',       poly: 0x1021, init: 0x0000, refin: true,  refout: true,  xorout: 0x0000 },
  { name: 'X25',          poly: 0x1021, init: 0xffff, refin: true,  refout: true,  xorout: 0xffff },
  { name: 'AUG-CCITT',    poly: 0x1021, init: 0x1d0f, refin: false, refout: false, xorout: 0x0000 },
  { name: 'DNP',          poly: 0x3d65, init: 0x0000, refin: true,  refout: true,  xorout: 0xffff },
  { name: 'T10-DIF',      poly: 0x8bb7, init: 0x0000, refin: false, refout: false, xorout: 0x0000 }
]

const RAW = '01,31,,26932000001877489821,10500.00,20261110,,277D'
const parts = RAW.split(',')
const TARGET = 0x277d

const payloads = {
  '前7项(含尾逗号)': parts.slice(0, 7).join(','),
  '前7项(去尾逗号)': parts.slice(0, 7).join(',').replace(/,$/, ''),
  '前6项': parts.slice(0, 6).join(','),
  '前8项全含': RAW,
  '跳过空项': parts.slice(0, 7).filter(s => s !== '').join(',')
}

console.log('目标 CRC = 0x' + TARGET.toString(16).toUpperCase() + '\n')
console.log('载荷候选：')
Object.keys(payloads).forEach(function (k) {
  console.log('  ' + k + ' = "' + payloads[k] + '"')
})
console.log('')

const hits = []
Object.keys(payloads).forEach(function (pk) {
  const bytes = Buffer.from(payloads[pk], 'latin1')
  VARIANTS.forEach(function (v) {
    const got = crc16(bytes, v)
    if (got === TARGET) hits.push({ payload: pk, variant: v.name })
  })
})

if (hits.length) {
  console.log('命中 ' + hits.length + ' 组：')
  hits.forEach(function (h) {
    const v = VARIANTS.find(function (x) { return x.name === h.variant })
    console.log('  ' + h.variant + '  ←  ' + h.payload)
    console.log('      poly=0x' + v.poly.toString(16).toUpperCase().padStart(4, '0') +
      ' init=0x' + v.init.toString(16).toUpperCase().padStart(4, '0') +
      ' refin=' + v.refin + ' refout=' + v.refout +
      ' xorout=0x' + v.xorout.toString(16).toUpperCase().padStart(4, '0'))
  })
} else {
  console.log('标准变体全部未命中。列出各变体在「前7项(含尾逗号)」下的结果供比对：')
  const bytes = Buffer.from(payloads['前7项(含尾逗号)'], 'latin1')
  VARIANTS.forEach(function (v) {
    const got = crc16(bytes, v)
    console.log('  ' + v.name.padEnd(14) + '0x' + got.toString(16).toUpperCase().padStart(4, '0'))
  })
}
