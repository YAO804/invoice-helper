const store = require('../../utils/store')
const collect = require('../../utils/collect')
const batch = require('../../utils/batch')

Page({
  data: {
    count: 0,
    amountText: '0.00',
    reviewCount: 0
  },

  onShow() { this.refresh() },

  refresh() {
    const list = store.listInvoices({ sortBy: store.getBasis() })
    this.setData({
      count: list.length,
      amountText: store.yuan(list.reduce(function (s, inv) { return s + (Number(inv.total_cent) || 0) }, 0)),
      reviewCount: store.reviewList().length
    })
  },

  onScan() {
    const that = this
    collect.scanDrafts().then(function (r) { that.commit(r.drafts) })
  },

  onImport() {
    const that = this
    collect.fileDrafts().then(function (r) {
      if (!r.ok) return wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      that.commit(r.results.filter(okDraft).map(toDraft))
    })
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  onExport() {
    wx.navigateTo({ url: '/pages/export/export' })
  },

  onReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  },

  commit(drafts) {
    const that = this
    if (!drafts || !drafts.length) {
      return wx.showToast({ title: '没有可保存的内容', icon: 'none' })
    }
    const report = batch.saveAll(drafts)
    wx.showModal({
      title: '导入完成',
      content: batch.describe(report),
      showCancel: false,
      success() { that.refresh() }
    })
  }
})

function okDraft(r) { return r.ok }

function toDraft(r) { return r.draft }
