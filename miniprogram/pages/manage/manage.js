const store = require('../../utils/store')
const purge = require('../../utils/purge')

function todayText() {
  const d = new Date()
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function confirmRemove(content, ids, done) {
  wx.showModal({
    title: '确认删除？',
    content: content,
    confirmColor: '#b42318',
    success(res) {
      if (!res.confirm) return
      const report = purge.removeIds(ids)
      wx.showToast({ title: '已删除 ' + report.deleted + ' 张', icon: 'none' })
      done()
    }
  })
}

Page({
  data: {
    mode: 'pick',
    list: [],
    selectedIds: [],
    fromDate: '',
    toDate: '',
    rangeCount: 0,
    rangeTotal: '0.00'
  },

  onLoad() {
    const t = todayText()
    this.setData({ fromDate: t, toDate: t })
  },

  onShow() { this.refresh() },

  refresh() {
    const all = store.listInvoices({ sortBy: 'created' })
    this.setData({ list: purge.cards(all, this.data.selectedIds) })
    this.previewRange()
  },

  onModeChange(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  onToggle(e) {
    const id = Number(e.currentTarget.dataset.id)
    const ids = this.data.selectedIds.slice()
    const i = ids.indexOf(id)
    if (i < 0) ids.push(id)
    else ids.splice(i, 1)
    this.setData({ selectedIds: ids })
    this.refresh()
  },

  onFromChange(e) {
    this.setData({ fromDate: e.detail.value })
    this.previewRange()
  },

  onToChange(e) {
    this.setData({ toDate: e.detail.value })
    this.previewRange()
  },

  previewRange() {
    const list = purge.inRange(this.data.fromDate, this.data.toDate)
    this.setData({ rangeCount: list.length, rangeTotal: purge.totalText(list) })
  },

  onDeleteSelected() {
    const that = this
    const ids = this.data.selectedIds
    if (!ids.length) return wx.showToast({ title: '还没有勾选发票', icon: 'none' })
    confirmRemove(
      '将删除勾选的 ' + ids.length + ' 张记录。只删台账记录，不删原件文件，删除后无法恢复。',
      ids,
      function () {
        that.setData({ selectedIds: [] })
        that.refresh()
      }
    )
  },

  onDeleteRange() {
    const that = this
    const list = purge.inRange(this.data.fromDate, this.data.toDate)
    if (!list.length) return wx.showToast({ title: '该时间段没有发票', icon: 'none' })
    const ids = list.map(function (inv) { return inv.id })
    confirmRemove(
      this.data.fromDate + ' 至 ' + this.data.toDate + ' 共 ' + ids.length + ' 张（¥' + purge.totalText(list) +
        '）。只删台账记录，不删原件文件，删除后无法恢复。',
      ids,
      function () { that.refresh() }
    )
  }
})
