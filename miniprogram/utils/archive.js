/**
 * 原件存档：把会话临时文件复制到 USER_DATA_PATH/invoices/files/
 *
 * 小程序拿不到 md5/sha256 同步接口，wx.getFileInfo 只保证 md5/sha1；
 * 取不到时用「文件名 + 大小」的 FNV 哈希兜底，去重键为 md5 前 8 位 + size。
 */

const fsx = require('./fsx')

let FS = null
let WX = null

/** 测试注入用 */
function setEnv(opts) {
  if (opts.fileSystem) FS = opts.fileSystem
  if (opts.wx) WX = opts.wx
}

function wxApi() {
  if (!WX) WX = wx
  return WX
}

function fileSystem() {
  if (!FS) FS = wxApi().getFileSystemManager()
  return FS
}

function filesDir() {
  return fsx.userDir() + '/files'
}

/** 微信会话里传过来的文件名可能带 / 或表情，落盘前清洗 */
function safeName(name) {
  return String(name || 'invoice')
    .replace(/[\\/:*?"<>|\r\n]/g, '_')
    .slice(0, 100)
}

/** 简单 FNV-1a，仅用于兜底，不用于安全用途 */
function fallbackDigest(name, size) {
  let h = 0x811c9dc5
  const s = name + ':' + size
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function md5(path) {
  return new Promise(function (resolve) {
    wxApi().getFileInfo({
      filePath: path,
      digestAlgorithm: 'md5',
      success: function (r) { resolve(r.digest || '') },
      fail: function () { resolve('') }
    })
  })
}

/** 复制一份原件进私有目录，返回可写进台账的 files 条目 */
function save(tempPath, originalName, size) {
  const clean = safeName(originalName)
  const bytes = Number(size) || 0
  return md5(tempPath).then(function (digest) {
    const id = digest ? digest.slice(0, 8) : fallbackDigest(clean, bytes)
    const target = filesDir() + '/' + id + '_' + clean
    fsx.ensureDir(filesDir())
    fileSystem().copyFileSync(tempPath, target)
    return {
      name: clean,
      path: target,
      size: bytes,
      digest: digest || id,
      digestType: digest ? 'md5' : 'fallback'
    }
  })
}

module.exports = {
  setEnv: setEnv,
  filesDir: filesDir,
  safeName: safeName,
  fallbackDigest: fallbackDigest,
  save: save
}
