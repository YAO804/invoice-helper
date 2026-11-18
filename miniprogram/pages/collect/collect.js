/**
 * 收票页：扫码 / 选文件 → 内存草稿 → 查重 → 发送到电脑台账。
 *
 * 小程序不落本地台账，所以每一步都是「当场发送」：
 * 发送失败或用户取消，这批草稿就丢了，需要重新扫。
 * 这是刻意取舍——只保留一份权威数据，避免两端对账。
 */

const collect = require('../../utils/collect')
const scanbatch = require('../../utils/scanbatch')
const invoicesend = require('../../utils/invoicesend')
const ledger = require('../../utils/ledger')
const lanservice = require('../../utils/lanservice')

Page({
  data: {
    connected: false,
    baseText: '',
    syncing: false,
    ledgerCount: 0,
    sending: false
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const base = lanservice.getBase()
    this.setData({ connected: !!base, baseText: base })
    if (!base) return Promise.resolve()
    // 顺手把台账同步到内存，扫码时才能当场判断是否重复
    return this.syncLedger()
  },

  syncLedger() {
    const that = this
    this.setData({ syncing: true })
    return ledger.sync({}).then(function (snap) {
      that.setData({ ledgerCount: snap.total, syncing: false })
    }).catch(function () {
      that.setData({ ledgerCount: 0, syncing: false })
    })
  },

  onScan() {
    const that = this
    collect.scanDrafts().then(function (r) { that.send(r.drafts) })
  },

  onBatchScan() {
    const that = this
    scanbatch.notice().then(function (go) {
      if (!go) return
      return scanbatch.scanBatch().then(function (r) { that.finishBatch(r) })
    })
  },

  finishBatch(r) {
    if (!r.drafts.length) {
      const tip = r.duplicates ? '扫到的 ' + r.duplicates + ' 张都与已有票重复，已跳过' : '没有扫到发票'
      return wx.showToast({ title: tip, icon: 'none', duration: 2500 })
    }
    const repeatTip = r.duplicates ? '\n跳过重复 ' + r.duplicates + ' 张。' : ''
    wx.showModal({
      title: '批量扫码完成',
      content: '本次收下 ' + r.drafts.length + ' 张。' + repeatTip,
      showCancel: false,
      success: () => this.send(r.drafts)
    })
  },

  onImport() {
    const that = this
    collect.fileDrafts().then(function (r) {
      if (!r.ok) return wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      const drafts = r.results.filter(okDraft).map(toDraft)
      if (!drafts.length) {
        const failed = r.results.length
        return wx.showToast({
          title: failed ? failed + ' 个文件都没解析出号码' : '没有可发送的内容',
          icon: 'none',
          duration: 2500
        })
      }
      const skipped = r.results.length - drafts.length
      wx.showModal({
        title: '导入完成',
        content: '解析出 ' + drafts.length + ' 张' + (skipped ? '，跳过 ' + skipped + ' 个无号码文件' : '') + '。',
        showCancel: false,
        success: function () { that.send(drafts) }
      })
    })
  },

  /** 统一出口：没连电脑就先提示，连上后走查重 → 发送 → 重新同步 */
  send(drafts) {
    if (!drafts || !drafts.length) {
      return wx.showToast({ title: '没有可发送的内容', icon: 'none' })
    }
    if (!lanservice.getBase()) {
      return wx.showToast({ title: '请先到「设置」连接电脑', icon: 'none', duration: 2500 })
    }
    if (this.data.sending) return
    this.setData({ sending: true })

    const that = this
    invoicesend.send(drafts).then(function (summary) {
      that.setData({ sending: false })
      if (summary.error) {
        return wx.showModal({
          title: '发送失败',
          content: summary.error + '\n\n这批发票未保存，需要重新扫。',
          showCancel: false
        })
      }
      if (summary.cancelled) return

      const tip = '成功发送 ' + summary.sent + ' 张' +
        (summary.skipped ? '\n跳过重复 ' + summary.skipped + ' 张' : '') +
        (summary.left ? '\n未发送 ' + summary.left + ' 张（单次上限 200 张）' : '') +
        (summary.batch ? '\n批次：' + summary.batch : '') +
        '\n电脑台账会把报销人为空的标成待补录。'

      wx.showModal({
        title: '已发送到电脑台账',
        content: tip,
        showCancel: false,
        success: function () { that.syncLedger() }
      })
    })
  },

  onLedger() {
    wx.switchTab({ url: '/pages/list/list' })
  },

  onTransfer() {
    wx.switchTab({ url: '/pages/transfer/transfer' })
  },

  onSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  }
})

function okDraft(r) { return r.ok }

function toDraft(r) { return r.draft }
