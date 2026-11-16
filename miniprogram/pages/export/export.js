const store = require('../../utils/store')
const fsx = require('../../utils/fsx')
const exporter = require('../../utils/export')
const batchmark = require('../../utils/batchmark')
const exportsel = require('../../utils/exportsel')
const exportflow = require('../../utils/exportflow')

function contentState() {
  return exportsel.CONTENTS.map(function (c) {
    return { key: c.key, name: c.name, on: c.key === 'ledger' }
  })
}

Page({
  data: {
    basis: 'created',
    scopes: exportsel.SCOPES,
    contents: contentState(),
    scope: 'batch',
    hasBatch: false,
    months: [],
    monthOptions: ['全部月份'],
    monthIndex: 0,
    month: '',
    currentMonthText: '全部月份',
    customIds: [],
    customList: [],
    count: 0,
    amountText: '0.00',
    fileCount: 0,
    expiredCount: 0,
    expiredTip: ''
  },

  onLoad() {
    const basis = store.getBasis()
    this.setData({
      basis: basis,
      scope: exportsel.defaultScope(),
      hasBatch: !!batchmark.current()
    })
    this.loadMonths()
    this.loadCustom()
  },

  onShow() { this.refresh() },

  loadMonths() {
    const months = store.months(this.data.basis)
    this.setData({ months: months, monthOptions: ['全部月份'].concat(months) })
  },

  loadCustom() {
    const all = store.listInvoices({ sortBy: this.data.basis })
    this.setData({ customList: exportsel.toCards(all, this.data.customIds) })
  },

  onScopeChange(e) {
    const value = e.currentTarget.dataset.value
    if (value === 'month' && !this.data.month) {
      return wx.showToast({ title: '请在下方选择月份', icon: 'none' })
    }
    this.setData({ scope: value })
    this.refresh()
  },

  onMonthChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      monthIndex: i,
      month: i === 0 ? '' : this.data.months[i - 1],
      currentMonthText: i === 0 ? '全部月份' : this.data.months[i - 1]
    })
    if (this.data.scope === 'month') this.refresh()
  },

  onToggleCustom(e) {
    const id = Number(e.currentTarget.dataset.id)
    const ids = this.data.customIds.slice()
    const i = ids.indexOf(id)
    if (i < 0) ids.push(id)
    else ids.splice(i, 1)
    this.setData({ customIds: ids })
    this.loadCustom()
    if (this.data.scope === 'custom') this.refresh()
  },

  onToggleContent(e) {
    const key = e.currentTarget.dataset.key
    const contents = this.data.contents.map(function (c) {
      return c.key === key ? Object.assign({}, c, { on: !c.on }) : c
    })
    this.setData({ contents: contents })
  },

  resolve() {
    return exportsel.resolve(this.data.scope, {
      basis: this.data.basis,
      month: this.data.month,
      ids: this.data.customIds
    })
  },

  refresh() {
    const list = this.resolve()
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
    this.loadCustom()
  },

  buildTasks(list) {
    const on = {}
    this.data.contents.forEach(function (c) { on[c.key] = c.on })
    const tasks = []
    if (on.ledger) tasks.push({ kind: 'csv', name: '台账.csv', text: exporter.ledgerCsv(list) })
    if (on.manifest) tasks.push({ kind: 'csv', name: '原件清单.csv', text: exporter.manifestCsv(list) })
    if (on.files) {
      exporter.allFiles(list).forEach(function (f) {
        tasks.push({ kind: 'file', path: f.path, name: f.name })
      })
    }
    return tasks
  },

  onExport() {
    const that = this
    const list = this.resolve()
    if (!list.length) return wx.showToast({ title: '所选范围没有发票', icon: 'none' })
    const tasks = this.buildTasks(list)
    if (!tasks.length) return wx.showToast({ title: '请至少勾选一种导出内容', icon: 'none' })
    exportflow.run(tasks).then(function (r) {
      if (r.cancelled) return wx.showToast({ title: '已取消导出', icon: 'none' })
      if (!r.ok) {
        return wx.showToast({ title: '导出中断：' + (r.message || ''), icon: 'none', duration: 2500 })
      }
      wx.showToast({ title: '已导出 ' + tasks.length + ' 个文件', icon: 'none' })
      that.refresh()
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
