/**
 * 传输页 · 发到电脑方向：本机发送记录、电脑已收列表、从会话上传。
 *
 * 以对象形式导出，由页面壳 Object.assign 混入 Page；方法里的 this 仍是页面实例。
 */

const lanservice = require('../../utils/lanservice')
const filesend = require('../../utils/filesend')

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 2500 })
}

module.exports = {
  refreshHistory() {
    this.setData({ history: filesend.displayHistory() })
    this.syncSelection()
  },

  loadRemote() {
    if (this.data.remoteLoading) return Promise.resolve()
    if (!lanservice.getBase()) {
      this.setData({ remoteLoaded: true, remote: [] })
      return Promise.resolve()
    }

    const that = this
    this.setData({ remoteLoading: true })
    return filesend.remoteList().then(function (list) {
      that.setData({ remote: list, remoteLoaded: true, remoteLoading: false })
      that.syncSelection()
    }).catch(function (e) {
      that.setData({ remoteLoading: false })
      toast('读取电脑端文件失败：' + (e.message || '连接异常'))
    })
  },

  onFromChat() {
    const that = this
    if (!lanservice.getBase()) return toast('请先连接电脑')

    wx.showLoading({ title: '上传中', mask: true })
    filesend.sendFromChat().then(function (r) {
      wx.hideLoading()
      that.refreshHistory()
      if (r.error) return toast(r.error)
      wx.showModal({
        title: '上传完成',
        content: '成功 ' + r.ok + ' 个' +
          (r.duplicate ? '\n电脑端已有 ' + r.duplicate + ' 个' : '') +
          (r.fail ? '\n失败 ' + r.fail + ' 个' : ''),
        showCancel: false,
        success: function () { that.loadRemote() }
      })
    })
  }
}
