const store = require('../../utils/store')
const fsx = require('../../utils/fsx')
const exporter = require('../../utils/export')

Page({
  data: {
    basis: 'created',
    months: [],
    monthOptions: ['全部月份'],
    monthIndex: 0,
    month: '',
    currentMonthText: '全部月份',
    count: 0,
    amountText: '0.00',
    fileCount: 0,
    expiredCount: 0,
    expiredTip: ''
  },

  onLoad() { this.setData({ basis: store.getBasis() }); this.loadMonths() },
  onShow() { this.refresh() },

  loadMonths() {
    const months = store.months(this.data.basis)
    this.setData({ months: months, monthOptions: ['全部月份'].concat(months) })
  },

  onMonthChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      monthIndex: i,
      month: i === 0 ? '' : this.data.months[i - 1],
      currentMonthText: i === 0 ? '全部月份' : this.data.months[i - 1]
    })
    this.refresh()
  },

  refresh() {
    const list = store.listInvoices({ month: this.data.month, monthBasis: this.data.basis, sortBy: this.data.basis })
    const total = list.reduce(function (s, inv) { return s + (Number(inv.total_cent) || 0) }, 0)
    const expired = exporter.expiredFiles(30)
    this.setData({
      count: list.length,
      amountText: store.yuan(total),
      fileCount: exporter.allFiles(list).length,
      expiredCount: expired.length,
      expiredTip: expired.length
        ? '有 ' + expired.length + ' 个原件超过 30 天，清理前请先导出留底。'
        : ''
    })
  },

  onExportLedger() { this.exportText('台账.csv', exporter.ledgerCsv(this.invoices())) },

  onExportManifest() { this.exportText('原件清单.csv', exporter.manifestCsv(this.invoices())) },

  invoices() {
    return store.listInvoices({ month: this.data.month, monthBasis: this.data.basis, sortBy: this.data.basis })
  },

  exportText(name, content) {
    const path = exporter.writeCsv(name, content)
    wx.shareFileMessage({
      filePath: path,
      fileName: name,
      fail(err) {
        wx.showToast({ title: '转发失败：' + (err.errMsg || ''), icon: 'none' })
      }
    })
  },

  onShareFiles() {
    const files = exporter.allFiles(this.invoices())
    if (!files.length) return wx.showToast({ title: '所选范围没有原件', icon: 'none' })
    this.sendFiles(files, 0)
  },

  /** 逐个转发；微信一次只能发一个文件，用户取消即停 */
  sendFiles(files, i) {
    if (i >= files.length) return
    const that = this
    wx.shareFileMessage({
      filePath: files[i].path,
      fileName: files[i].name,
      success() { that.sendFiles(files, i + 1) },
      fail(err) {
        if (/cancel/i.test(err.errMsg || '')) return
        wx.showToast({ title: '转发中断：' + (err.errMsg || ''), icon: 'none' })
      }
    })
  },

  onCleanExpired() {
    const that = this
    wx.showModal({
      title: '清理过期原件？',
      content: '只删 30 天前的原件文件，不动台账记录。删掉后无法从本机找回。',
      success(res) {
        if (!res.confirm) return
        const removed = fsx.cleanExpired(fsx.userDir() + '/files', 30)
        wx.showToast({ title: '已清理 ' + removed.length + ' 个', icon: 'none' })
        that.refresh()
      }
    })
  }
})
