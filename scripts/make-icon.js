/**
 * 生成小程序头像 144×144 PNG
 * 纯 Node 实现，不依赖任何图形库。
 *
 * 造型：底部锯齿边的小票（receipt），内部三条文字行。
 * 锯齿是"收据/小票"最强的视觉特征，小尺寸下比票根缺口更易辨识。
 *
 *   node scripts/make-icon.js
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 144
const BG = [15, 110, 86]      // #0F6E56 深青，与小程序 UI 主色一致
const FG = [255, 255, 255]    // 小票

/* ---------- PNG 编码 ---------- */

let crcTable = null
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      crcTable[i] = c
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/* ---------- 几何 ---------- */

const X0 = 30, X1 = 114          // 小票左右边界
const Y0 = 28                    // 顶部
const TOOTH = 10                 // 锯齿宽度
const TOOTH_DEPTH = 7            // 锯齿深度
const Y_FLAT = 110               // 锯齿起始高度（平直部分底边）
const CORNER = 8                 // 顶部圆角

function bottomAt(x) {
  const phase = (x - X0) % TOOTH
  const wave = Math.abs(phase - TOOTH / 2) / (TOOTH / 2)   // 0(谷) .. 1(峰)
  return Y_FLAT + wave * TOOTH_DEPTH
}

function inReceipt(x, y) {
  if (x < X0 || x >= X1) return false
  if (y < Y0) return false
  if (y >= bottomAt(x)) return false

  // 顶部两角做圆角，底部保持锯齿
  if (y < Y0 + CORNER) {
    if (x < X0 + CORNER) {
      const dx = X0 + CORNER - x
      const dy = Y0 + CORNER - y
      if (dx * dx + dy * dy > CORNER * CORNER) return false
    }
    if (x >= X1 - CORNER) {
      const dx = x - (X1 - CORNER - 1)
      const dy = Y0 + CORNER - y
      if (dx * dx + dy * dy > CORNER * CORNER) return false
    }
  }
  return true
}

function inRect(x, y, x0, y0, w, h) {
  return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h
}

const buf = Buffer.alloc(SIZE * SIZE * 4)

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let color = BG

    if (inReceipt(x, y)) color = FG

    // 三条文字行
    const lineX = 46, lineW = 52, lineH = 5
    if (inRect(x, y, lineX, 46, lineW, lineH)) color = BG
    if (inRect(x, y, lineX, 60, lineW, lineH)) color = BG
    if (inRect(x, y, lineX, 74, lineW, lineH)) color = BG

    const i = (y * SIZE + x) * 4
    buf[i] = color[0]
    buf[i + 1] = color[1]
    buf[i + 2] = color[2]
    buf[i + 3] = 255
  }
}

const outDir = path.join(__dirname, '..', 'assets')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'icon-144.png')
fs.writeFileSync(outPath, encodePng(SIZE, SIZE, buf))
console.log('生成: ' + outPath + '  (' + fs.statSync(outPath).size + ' 字节)')
