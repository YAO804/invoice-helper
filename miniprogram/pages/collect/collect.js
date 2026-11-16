const store = require('../../utils/store')
const collect = require('../../utils/collect')
const batch = require('../../utils/batch')
const scanbatch = require('../../utils/scanbatch')
const batchmark = require('../../utils/batchmark')

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

  onBatchScan() {
    const that = this
    scanbatch.notice().then(function (go) {
      if (!go) return
      return scanbatch.scanBatch().then(function (r) { that.finishBatch(r) })
    })
  },

  finishBatch(r) {
    const that = this
    if (!r.drafts.length) {
      const tip = r.duplicates ? '扫到的 ' + r.duplicates + ' 张都与已有票重复，已跳过' : '没有扫到发票'
      return wx.showToast({ title: tip, icon: 'none', duration: 2500 })
    }
    const batchId = 'b' + Date.now()
    const marked = r.drafts.map(function (d) { return Object.assign({}, d, { batch_id: batchId }) })
    const report = batch.saveAll(marked)
    batchmark.set(batchId)
    const repeatTip = r.duplicates ? '\n扫码时跳过重复 ' + r.duplicates + ' 张。' : ''
    wx.showModal({
      title: '批量扫码完成',
      content: batch.describe(report) + repeatTip + '\n\n本次收下 ' + r.drafts.length + ' 张，导出页默认选中本次扫码。现在导出到电脑？',
      confirmText: '去导出',
      cancelText: '稍后',
      success(res) {
        that.refresh()
        if (res.confirm) wx.navigateTo({ url: '/pages/export/export' })
      }
    })
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
