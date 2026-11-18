/**
 * 传输页 · 从电脑取方向：列出待取文件、单条接收、批量接收。
 *
 * 以对象形式导出，由页面壳 Object.assign 混入 Page；方法里的 this 仍是页面实例。
 */

const lanservice = require('../../utils/lanservice')
const filetake = require('../../utils/filetake')

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 2500 })
}

module.exports = {
  loadOffer() {
    if (this.data.offerLoading) return Promise.resolve()
    if (!lanservice.getBase()) {
      this.setData({ offerLoaded: true, offer: [] })
      return Promise.resolve()
    }

    const that = this
    this.setData({ offerLoading: true })
    return filetake.list().then(function (list) {
      that.setData({ offer: list, offerLoaded: true, offerLoading: false })
      that.syncSelection()
    }).catch(function (e) {
      that.setData({ offerLoading: false })
      toast('读取待取文件失败：' + (e.message || '连接异常'))
    })
  },

  /** 单条接收：下载后由 filetake 弹选择（转发到聊天 / 预览） */
  onReceiveOne(e) {
    const name = e.currentTarget.dataset.name
    if (!lanservice.getBase()) return toast('请先连接电脑')

    wx.showLoading({ title: '接收中', mask: true })
    filetake.receive(name).then(function (r) {
      wx.hideLoading()
      if (r.action === 'cancel') return
      if (r.ok) return toast(r.action === 'preview' ? '已打开' : '已转发到聊天')
      if (!r.cancelled) toast('失败：' + (r.message || '未知原因'))
    }).catch(function (err) {
      wx.hideLoading()
      toast('接收失败：' + (err.message || '连接异常'))
    })
  },

  /** 批量接收：逐个下载再逐个转发，单个失败不中断 */
  onReceiveSelected() {
    const names = this.data.selectedIds.slice()
    if (!names.length) return toast('还没有勾选')

    const that = this
    wx.showLoading({ title: '接收中', mask: true })
    filetake.takeAndShare(names).then(function (r) {
      wx.hideLoading()
      that.setData({ selectedIds: [] })
      that.syncSelection()
      if (!r.ok) return toast(r.message || '接收失败')
      if (r.failed && r.failed.length) {
        return toast('已接收 ' + r.count + ' 个，失败 ' + r.failed.length + ' 个')
      }
    }).catch(function (err) {
      wx.hideLoading()
      toast('接收失败：' + (err.message || '连接异常'))
    })
  }
}
