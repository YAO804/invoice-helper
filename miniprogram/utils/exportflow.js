/** 按用户勾选顺序逐个转发；微信一次只能发一个文件，取消或失败即停。 */

const exporter = require('./export')

function share(task) {
  return new Promise(function (resolve) {
    const opts = {
      success: function () { resolve({ ok: true }) },
      fail: function (err) {
        const message = (err && err.errMsg) || ''
        resolve({ ok: false, cancelled: /cancel/i.test(message), message: message })
      }
    }
    if (task.kind === 'csv') {
      opts.filePath = exporter.writeCsv(task.name, task.text)
      opts.fileName = task.name
    } else {
      opts.filePath = task.path
      opts.fileName = task.name
    }
    wx.shareFileMessage(opts)
  })
}

function run(tasks) {
  return (tasks || []).reduce(function (chain, task) {
    return chain.then(function (prev) {
      if (prev && (!prev.ok || prev.cancelled)) return prev
      return share(task)
    })
  }, Promise.resolve(null)).then(function (r) {
    return r || { ok: true, cancelled: false }
  })
}

module.exports = { run: run }
