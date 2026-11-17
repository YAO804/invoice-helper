const store = require('../../utils/store')
const collect = require('../../utils/collect')
const batch = require('../../utils/batch')
const scanbatch = require('../../utils/scanbatch')
const batchmark = require('../../utils/batchmark')
const invoicesend = require('../../utils/invoicesend')

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
      content: batch.describe(report) + repeatTip + '\n\n本次收下 ' + r.drafts.length + ' 张。是否发送到电脑台账？',
      confirmText: '发送',
      cancelText: '稍后',
      success(res) {
        that.refresh()
        if (res.confirm) sendToDesktop(r.drafts, function () { that.refresh() })
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

  onTransfer() {
    wx.navigateTo({ url: '/pages/transfer/transfer' })
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
      content: batch.describe(report) + '\n\n是否发送到电脑台账？',
      confirmText: '发送',
      cancelText: '稍后',
      success(res) {
        that.refresh()
        if (res.confirm) sendToDesktop(drafts, function () { that.refresh() })
      }
    })
  }
})

function okDraft(r) { return r.ok }

function toDraft(r) { return r.draft }

function sendToDesktop(drafts, done) {
  invoicesend.send(drafts).then(function (summary) {
    if (summary.error) {
      return wx.showToast({ title: '发送失败：' + summary.error, icon: 'none', duration: 2500 })
    }
    if (summary.cancelled) return

    const tip = '成功发送 ' + summary.sent + ' 张' +
      (summary.skipped ? '\n跳过重复 ' + summary.skipped + ' 张' : '') +
      (summary.left ? '\n未发送 ' + summary.left + ' 张（单次上限 200 张）' : '') +
      (summary.batch ? '\n批次：' + summary.batch : '') +
      '\n电脑台账会自动标记待补录。'

    wx.showModal({
      title: '已发送到电脑台账',
      content: tip,
      showCancel: false,
      success() { if (done) done() }
    })
  })
}
