const lanservice = require('../../utils/lanservice')
const filesend = require('../../utils/filesend')

Page({
  data: {
    connected: false,
    baseText: '未配置电脑地址',
    ledgerFileCount: 0,
    history: [],
    remote: [],
    remoteLoaded: false
  },

  onShow() { this.refresh() },

  refresh() {
    const base = lanservice.getBase()
    this.setData({
      connected: !!base,
      baseText: base ? ('电脑地址：' + base) : '未配置电脑地址',
      ledgerFileCount: filesend.ledgerFiles().length,
      history: filesend.displayHistory()
    })
  },

  onFromChat() {
    const that = this
    if (!lanservice.getBase()) {
      return wx.showToast({ title: '请先连接电脑', icon: 'none' })
    }
    wx.showLoading({ title: '上传中', mask: true })
    filesend.sendFromChat().then(function (r) {
      wx.hideLoading()
      that.refresh()
      if (r.error) return wx.showToast({ title: r.error, icon: 'none', duration: 2500 })
      wx.showModal({
        title: '上传完成',
        content: '成功 ' + r.ok + ' 个' +
          (r.duplicate ? '\n电脑端已有 ' + r.duplicate + ' 个' : '') +
          (r.fail ? '\n失败 ' + r.fail + ' 个' : ''),
        showCancel: false
      })
    })
  },

  onFromLedger() {
    const that = this
    if (!lanservice.getBase()) {
      return wx.showToast({ title: '请先连接电脑', icon: 'none' })
    }
    if (!filesend.ledgerFiles().length) {
      return wx.showToast({ title: '台账里没有已存原件', icon: 'none' })
    }
    wx.showLoading({ title: '上传中', mask: true })
    filesend.sendLedgerFiles().then(function (r) {
      wx.hideLoading()
      that.refresh()
      wx.showModal({
        title: '上传完成',
        content: '共 ' + r.total + ' 个原件：成功 ' + r.ok +
          (r.duplicate ? '、已存在 ' + r.duplicate : '') + '、失败 ' + r.fail,
        showCancel: false
      })
    })
  },

  onRefreshRemote() {
    const that = this
    if (!lanservice.getBase()) {
      return wx.showToast({ title: '请先连接电脑', icon: 'none' })
    }
    wx.showLoading({ title: '读取中', mask: true })
    filesend.remoteFiles().then(function (r) {
      wx.hideLoading()
      that.setData({
        remote: r.incoming.map(function (f) {
          return Object.assign({}, f, { humanSize: filesend.human(f.size) })
        }),
        remoteLoaded: true
      })
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '读取失败：' + (e.message || '连接异常'), icon: 'none', duration: 2500 })
    })
  },

  onClearHistory() {
    const that = this
    wx.showModal({
      title: '清空发送记录',
      content: '只清空本机的发送记录，不影响已传到电脑的文件。',
      confirmText: '清空',
      success: function (r) {
        if (!r.confirm) return
        filesend.clearHistory()
        that.refresh()
      }
    })
  }
})
