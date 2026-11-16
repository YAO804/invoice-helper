/**
 * 本地文件系统辅助
 * 目标目录：wx.env.USER_DATA_PATH 下，属于小程序私有目录，不占 Storage 的 10MB 配额。
 */

const FS = wx.getFileSystemManager()

function userDir(sub) {
  return wx.env.USER_DATA_PATH + '/' + (sub || 'invoices')
}

function ensureDir(dir) {
  try {
    FS.accessSync(dir)
  } catch (e) {
    try { FS.mkdirSync(dir, true) } catch (e2) { return false }
  }
  return true
}

/** 递归遍历目录，返回 [{ path, name, size, mtime }] */
function walk(dir, out, depth) {
  out = out || []
  depth = depth || 0
  if (depth > 6) return out
  let names = []
  try {
    names = FS.readdirSync(dir)
  } catch (e) {
    return out
  }
  names.forEach(function (name) {
    const p = dir + '/' + name
    let st = null
    try { st = FS.statSync(p) } catch (e) {}
    if (!st) return
    if (st.isDirectory && st.isDirectory()) {
      walk(p, out, depth + 1)
    } else {
      out.push({
        path: p,
        name: name,
        size: st.size || 0,
        mtime: st.lastModifiedTime || 0
      })
    }
  })
  return out
}

function totalSize(list) {
  return list.reduce(function (s, f) { return s + (f.size || 0) }, 0)
}

function human(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

/** 删除超过 ttlDays 天的文件，返回删除清单 */
function cleanExpired(dir, ttlDays) {
  const ttl = (ttlDays || 30) * 24 * 3600
  const now = Math.floor(Date.now() / 1000)
  const list = walk(dir)
  const removed = []
  list.forEach(function (f) {
    if (!f.mtime) return
    if (now - f.mtime > ttl) {
      try {
        FS.unlinkSync(f.path)
        removed.push({ name: f.name, ageDays: Math.floor((now - f.mtime) / 86400) })
      } catch (e) {}
    }
  })
  return removed
}

module.exports = {
  userDir: userDir,
  ensureDir: ensureDir,
  walk: walk,
  totalSize: totalSize,
  human: human,
  cleanExpired: cleanExpired
}
