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
const hint = require('../../utils/connect-hint')

Page({
  data: {
    // 状态只认「台账同步有没有成功」，存过地址不等于连上了
    status: 'none',
    statusBadge: '未连接',
    statusTone: 'badge-grey',
    statusHint: '还没连电脑。小程序不存台账，必须先连上电脑才能收票。',
    needConnect: true,
    baseText: '',
    syncing: false,
    ledgerCount: 0,
    sending: false
  },

  onShow() {
    this.refresh()
  },

  /** 状态与文案统一由 hint.viewState 产出，页面只负责把状态摆对 */
  setState(patch) {
    this.setData(hint.viewState(this.data, patch))
  },

  refresh() {
    const base = lanservice.getBase()
    if (!base) {
      this.setState({ status: 'none', baseText: '', ledgerCount: 0, syncing: false })
      return Promise.resolve()
    }
    this.setState({ status: 'checking', baseText: base })
    // 同步台账就是最好的探活：这次请求成功才敢说「已连接」
    return this.syncLedger()
  },

  syncLedger() {
    const that = this
    this.setState({ syncing: true })
    return ledger.sync({}).then(function (snap) {
      that.setState({ status: 'ok', ledgerCount: snap.total, syncing: false })
    }).catch(function () {
      that.setState({ status: 'fail', ledgerCount: 0, syncing: false })
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
      that.showSentResult(summary)
    })
  },

  /** 发送成功提示：批次号只用来给「查看这批票」收敛列表，不写进文案 */
  showSentResult(summary) {
    const that = this
    const tip = '成功发送 ' + summary.sent + ' 张' +
      (summary.skipped ? '\n跳过重复 ' + summary.skipped + ' 张' : '') +
      (summary.left ? '\n未发送 ' + summary.left + ' 张（单次上限 200 张）' : '') +
      '\n电脑台账会把报销人为空的标成待补录。'

    const modal = {
      title: '已发送到电脑台账',
      content: tip,
      success: function (res) {
        that.syncLedger()
        if (!res.confirm || !summary.batch) return
        const app = typeof getApp === 'function' ? getApp() : null
        if (app && app.globalData) app.globalData.pendingBatch = summary.batch
        wx.switchTab({ url: '/pages/list/list' })
      }
    }
    if (summary.batch) {
      modal.confirmText = '查看这批票'
      modal.cancelText = '稍后'
    } else {
      modal.showCancel = false
    }
    wx.showModal(modal)
  },

  onTransfer() {
    wx.switchTab({ url: '/pages/transfer/transfer' })
  },

  onSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})

function okDraft(r) { return r.ok }

function toDraft(r) { return r.draft }
