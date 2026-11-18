/**
 * 从电脑取文件：列出待取区、下载、转发到聊天或预览。
 *
 * 微信没有「保存到手机磁盘」的通用接口，能真正落地的只有两条路：
 *   转发到聊天（wx.shareFileMessage，什么格式都能过）
 *   系统能力预览（wx.openDocument，只认 pdf/doc/docx/xls/xlsx/ppt/pptx）
 * 所以 OFD / XML / ZIP 只给「转发」，不给一个点了必然失败的「预览」。
 */

const lanservice = require('./lanservice')
const exportflow = require('./exportflow')
const format = require('./format')

const PREVIEWABLE = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

let WX = null
let LAN = null

/** 测试注入用 */
function setEnv(opts) {
  if (opts.wx) WX = opts.wx
  if (opts.lanservice) LAN = opts.lanservice
}

function wxApi() {
  if (!WX) WX = wx
  return WX
}

function lan() {
  if (!LAN) LAN = lanservice
  return LAN
}

/** 取小写扩展名（不含点）；没扩展名返回空串 */
function ext(name) {
  const text = String(name || '')
  const dot = text.lastIndexOf('.')
  if (dot < 0 || dot === text.length - 1) return ''
  return text.slice(dot + 1).toLowerCase()
}

function canPreview(name) {
  return PREVIEWABLE.indexOf(ext(name)) >= 0
}

/** 电脑端待取文件 → 展示结构。id 用文件名，删除接口本来就按名字删 */
function list() {
  return lan().listFiles().then(function (data) {
    const items = (data && data.outgoing) || []
    return items.map(function (file) {
      return {
        id: file.name,
        name: file.name,
        size: file.size,
        humanSize: format.human(file.size),
        timeText: format.isoText(file.modified_at),
        previewable: canPreview(file.name)
      }
    })
  })
}

/** 下载一个待取文件到本地临时路径 */
function download(name) {
  const url = lan().outgoingURL(name)
  if (!url) return Promise.reject(new Error('还没连接电脑'))

  return new Promise(function (resolve, reject) {
    wxApi().downloadFile({
      url: url,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.tempFilePath)
        reject(new Error('电脑端返回 HTTP ' + res.statusCode))
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '下载失败'))
      }
    })
  })
}

/** 用系统能力打开，只对 canPreview 的格式有意义 */
function preview(path) {
  return new Promise(function (resolve, reject) {
    wxApi().openDocument({
      filePath: path,
      showMenu: true,
      success: function () { resolve({ ok: true }) },
      fail: function (err) { reject(new Error((err && err.errMsg) || '打不开这个格式')) }
    })
  })
}

/** 顺序转发到聊天：微信一次只能发一个，节奏交给 exportflow 控制 */
function share(tasks) {
  return exportflow.run(tasks)
}

/**
 * 下载多个再逐个转发，供「接收选中」用。
 * 单个下载失败不中断其余，最后一起报告失败数量。
 */
function takeAndShare(names) {
  const wanted = (names || []).filter(function (name) { return !!name })
  if (!wanted.length) return Promise.resolve({ ok: false, message: '没有可接收的文件' })

  const tasks = []
  const failed = []
  return wanted.reduce(function (chain, name) {
    return chain.then(function () {
      return download(name).then(function (path) {
        tasks.push({ name: name, path: path })
      }).catch(function () {
        failed.push(name)
      })
    })
  }, Promise.resolve()).then(function () {
    if (!tasks.length) return { ok: false, message: '全部下载失败' }
    return share(tasks)
  }).then(function (result) {
    return Object.assign({ count: tasks.length, failed: failed }, result)
  })
}

/**
 * 单条接收：下载后问用户怎么用——转发到聊天，或者（支持的格式）直接预览。
 * 弹窗放这里而不是页面里，是因为「能预览什么」的判断就写在这，两处分开放容易漂。
 *
 * 下载失败会 reject（文件没拿到）；拿到了之后的动作结果放在 resolve 值里，
 * 调用方不用为「预览失败」再写一层 catch。
 */
function receive(name) {
  return download(name).then(function (path) {
    return new Promise(function (resolve) {
      const actions = ['转发到聊天']
      if (canPreview(name)) actions.push('预览')

      wxApi().showActionSheet({
        itemList: actions,
        success: function (res) {
          // 只有两个选项时才可能是「预览」；按长度判断，别信越界的 tapIndex
          const wantsPreview = actions.length > 1 && res.tapIndex === 1
          if (!wantsPreview) {
            return share([{ name: name, path: path }]).then(function (r) {
              resolve({ action: 'share', ok: !!r.ok, cancelled: !!r.cancelled, message: r.message })
            })
          }
          preview(path).then(function () {
            resolve({ action: 'preview', ok: true })
          }).catch(function (err) {
            resolve({ action: 'preview', ok: false, message: err.message })
          })
        },
        fail: function () { resolve({ action: 'cancel' }) }
      })
    })
  })
}

function remove(names) {
  return lan().deleteOutgoing(names)
}

function purge(days, confirm) {
  return lan().purgeOutgoing(days, confirm)
}

module.exports = {
  setEnv: setEnv,
  ext: ext,
  canPreview: canPreview,
  list: list,
  download: download,
  preview: preview,
  share: share,
  receive: receive,
  takeAndShare: takeAndShare,
  remove: remove,
  purge: purge
}
