/**
 * 按顺序把多个文件转发到微信聊天。
 *
 * 微信一次只能发一个文件，且连续调用 shareFileMessage 会被拒绝
 * （fail cancel / can not ...），所以每个文件发之前都弹确认，
 * 让用户有机会关掉上一个"已发送"浮层。
 *
 * 文件由调用方先落盘（导出走电脑端下载），这里只负责转发。
 */

function shareOptions(task, resolve) {
  wx.shareFileMessage({
    filePath: task.path,
    fileName: task.name,
    success: function () { resolve({ ok: true }) },
    fail: function (err) {
      const message = (err && err.errMsg) || ''
      resolve({ ok: false, cancelled: /cancel/i.test(message), message: message })
    }
  })
}

function share(task, index, total) {
  return new Promise(function (resolve) {
    wx.showModal({
      title: '发送文件 ' + (index + 1) + '/' + total,
      content: '准备发送「' + task.name + '」。\n如果上一个文件还在"已发送"提示，请先点「进入聊天」或返回，再点确定。',
      confirmText: '发送',
      cancelText: '结束',
      success: function (r) {
        if (!r.confirm) return resolve({ ok: false, cancelled: true })
        shareOptions(task, resolve)
      },
      fail: function () { resolve({ ok: false, cancelled: true }) }
    })
  })
}

function run(tasks) {
  const list = (tasks || []).filter(function (task) { return task && task.path })
  return list.reduce(function (chain, task, i) {
    return chain.then(function (prev) {
      if (prev && (!prev.ok || prev.cancelled)) return prev
      return share(task, i, list.length)
    })
  }, Promise.resolve(null)).then(function (r) {
    return r || { ok: true, cancelled: false }
  })
}

module.exports = { run: run }
