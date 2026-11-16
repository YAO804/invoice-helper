const einvoice = require('../../utils/einvoice')
const zipx = require('../../utils/zip')
const fsx = require('../../utils/fsx')

const FS = wx.getFileSystemManager()

Page({
  data: {
    env: {},
    s1: '',
    s2: '',
    s3: '',
    s4: '',
    s5: ''
  },

  onLoad() {
    let appBase = {}
    let dev = {}
    try { appBase = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {} } catch (e) {}
    try { dev = wx.getDeviceInfo ? wx.getDeviceInfo() : {} } catch (e) {}
    this.setData({
      env: {
        userDataPath: wx.env.USER_DATA_PATH,
        sdk: appBase.SDKVersion || '',
        platform: dev.platform || '',
        model: dev.model || ''
      }
    })
  },

  onCopy(e) {
    const key = e.currentTarget.dataset.key
    const text = this.data[key]
    if (!text) return
    wx.setClipboardData({ data: text })
  },

  /* ---------- S1 扫码取原文 ---------- */
  onScan() {
    const that = this
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success(res) {
        const raw = res.result || ''
        const kind = einvoice.classifyQr(raw)
        const out = {
          __spike: 'S1',
          kind: kind,
          rawLength: raw.length,
          scanType: res.scanType,
          charSet: res.charSet,
          raw: raw,
          legacyParsed: kind === 'legacy-csv' ? einvoice.parseLegacyQr(raw) : null,
          urlParts: kind === 'url' ? splitUrl(raw) : null
        }
        that.setData({ s1: JSON.stringify(out, null, 2) })
      },
      fail(err) {
        that.setData({ s1: '扫码失败：' + (err.errMsg || JSON.stringify(err)) })
      }
    })
  },

  /* ---------- S2 从会话选文件（不过滤） ---------- */
  onChooseFile() {
    const that = this
    wx.chooseMessageFile({
      count: 20,
      type: 'all',
      success(res) {
        const files = (res.tempFiles || []).map(function (f) {
          const p = f.path || f.tempFilePath || ''
          const name = f.name || ''
          const ext = name.indexOf('.') >= 0 ? name.split('.').pop().toLowerCase() : ''
          let readable = false
          try { FS.accessSync(p); readable = true } catch (e) {}
          return { name: name, ext: ext, size: f.size, type: f.type, path: p, readable: readable }
        })
        that.setData({ s2: JSON.stringify({ __spike: 'S2', count: files.length, files: files }, null, 2) })
      },
      fail(err) {
        that.setData({
          s2: '选择失败：' + (err.errMsg || JSON.stringify(err)) +
            '\n\n检查：1) 文件是否已发到「文件传输助手」 2) 是否在真机上操作（PC 端微信行为不同）'
        })
      }
    })
  },

  /* ---------- S3 端侧解析 XML ---------- */
  onParseXml() {
    const that = this
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xml', 'XML', 'inv', 'INV'],
      success(res) {
        const f = res.tempFiles[0]
        const path = f.path || f.tempFilePath
        if (!path) return that.setData({ s3: '未拿到文件路径' })

        FS.readFile({
          filePath: path,
          success(r) {
            const bytes = new Uint8Array(r.data)
            const enc = einvoice.detectEncoding(bytes)
            FS.readFile({
              filePath: path,
              encoding: 'utf-8',
              success(rr) {
                const text = rr.data
                const tagList = einvoice.dumpTagList(text)
                const parsed = einvoice.extractInvoice(text)
                const summary = parsed.ok
                  ? [
                      '发票号码：' + (parsed.invoiceNo || '-'),
                      '开票日期：' + (parsed.issueTime || '-'),
                      '销方：' + (parsed.seller.name || '-'),
                      '价税合计：' + (parsed.amount.withTax || '-') + ' 元',
                      '票种：' + (parsed.typeLabel || '-'),
                      '明细行数：' + parsed.itemCount,
                      '税务签名：' + (parsed.signature.present ? '有' : '无'),
                      '缺失字段：' + (parsed.missing.length ? parsed.missing.join('、') : '无')
                    ].join('\n')
                  : '解析失败：' + parsed.reason
                that.setData({
                  s3: summary + '\n\n─── 完整结果 ───\n' + JSON.stringify({
                    __spike: 'S3',
                    fileName: f.name,
                    size: f.size,
                    encoding: enc,
                    tagCount: tagList.length,
                    extracted: parsed,
                    allTags: tagList
                  }, null, 2)
                })
              },
              fail(e2) {
                that.setData({ s3: '读取文本失败：' + (e2.errMsg || JSON.stringify(e2)) })
              }
            })
          },
          fail(e) {
            that.setData({ s3: '读取二进制失败：' + (e.errMsg || JSON.stringify(e)) })
          }
        })
      },
      fail(err) {
        that.setData({
          s3: '选择失败：' + (err.errMsg || JSON.stringify(err)) +
            '\n\n若提示找不到文件，可能是 extension 过滤在 iOS/Android 上不生效，改天用 type:"all" 重试。'
        })
      }
    })
  },

  /* ---------- S4 探测 OFD / PDF 容器结构 ---------- */
  onInspectOfd() {
    const that = this
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['ofd', 'OFD', 'pdf', 'PDF'],
      success(res) {
        const f = res.tempFiles[0]
        const path = f.path || f.tempFilePath
        if (f.size && f.size > 30 * 1024 * 1024) {
          return that.setData({ s4: '文件过大（' + f.size + ' 字节），跳过' })
        }
        FS.readFile({
          filePath: path,
          success(r) {
            const bytes = new Uint8Array(r.data)
            const info = zipx.inspect(bytes)
            info.__spike = 'S4'
            info.fileName = f.name
            that.setData({ s4: JSON.stringify(info, null, 2) })
          },
          fail(e) {
            that.setData({ s4: '读取失败：' + (e.errMsg || JSON.stringify(e)) })
          }
        })
      },
      fail(err) {
        that.setData({ s4: '选择失败：' + (err.errMsg || '') })
      }
    })
  },

  /* ---------- S5 本地存储能力 ---------- */
  onStorageTest() {
    const dir = fsx.userDir()
    const report = { __spike: 'S5', dir: dir }

    report.dirCreated = fsx.ensureDir(dir)

    const big = new ArrayBuffer(5 * 1024 * 1024)
    const t0 = Date.now()
    let writeOk = false
    let writeErr = ''
    try {
      FS.writeFileSync(dir + '/__size_test.bin', big)
      writeOk = true
    } catch (e) {
      writeErr = e.message || JSON.stringify(e)
    }
    report.write5MB = { ok: writeOk, costMs: Date.now() - t0, err: writeErr }

    const list = fsx.walk(dir)
    report.fileCount = list.length
    report.totalBytes = fsx.totalSize(list)
    report.totalHuman = fsx.human(report.totalBytes)
    report.files = list.map(function (f) {
      return { name: f.name, size: f.size, human: fsx.human(f.size), mtime: f.mtime }
    })

    try {
      const si = wx.getStorageInfoSync()
      report.storageInfo = {
        keyCount: si.keys.length,
        currentSizeKB: si.currentSize,
        limitSizeKB: si.limitSize
      }
    } catch (e) {
      report.storageInfo = { err: String(e) }
    }

    try { FS.unlinkSync(dir + '/__size_test.bin') } catch (e) {}
    report.cleanedTestFile = true

    this.setData({ s5: JSON.stringify(report, null, 2) })
  },

  /* ---------- S5b 30 天过期清理 ---------- */
  onCleanExpired() {
    const dir = fsx.userDir()
    fsx.ensureDir(dir)
    const removed = fsx.cleanExpired(dir, 30)
    const rest = fsx.walk(dir)
    this.setData({
      s5: JSON.stringify({
        __spike: 'S5b',
        ttlDays: 30,
        removedCount: removed.length,
        removed: removed,
        remainCount: rest.length,
        remainBytes: fsx.totalSize(rest)
      }, null, 2)
    })
  }
})

function splitUrl(raw) {
  const q = raw.indexOf('?')
  if (q < 0) return { origin: raw, params: {} }
  const params = {}
  raw.slice(q + 1).split('&').forEach(function (kv) {
    const i = kv.indexOf('=')
    if (i < 0) return
    const k = kv.slice(0, i)
    let v = kv.slice(i + 1)
    try { v = decodeURIComponent(v) } catch (e) {}
    params[k] = v
  })
  return { origin: raw.slice(0, q), params: params }
}
