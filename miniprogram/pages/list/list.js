const store = require('../../utils/store')
const collect = require('../../utils/collect')
const batch = require('../../utils/batch')

function sourceName(src) {
  return { xml: 'XML', ofd: 'OFD', pdf: 'PDF', qr: '扫码', manual: '手录' }[src] || '其他'
}

function importedText(ms) {
  const d = new Date(Number(ms))
  if (isNaN(d.getTime())) return '导入时间未知'
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return '导入 ' + (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

Page({
  data: {
    basis: 'created',
    months: [],
    monthOptions: ['全部月份'],
    monthIndex: 0,
    month: '',
    keyword: '',
    invoices: [],
    totalCount: 0,
    totalText: '0.00',
    taxText: '0.00',
    currentMonthText: '全部月份'
  },

  onLoad() {
    const basis = store.getBasis()
    this.setData({ basis: basis })
    this.loadMonths()
  },

  onShow() {
    this.loadMonths()
    this.refresh()
  },

  loadMonths() {
    const months = store.months(this.data.basis)
    this.setData({ months: months, monthOptions: ['全部月份'].concat(months) })
  },

  onBasisChange(e) {
    const basis = e.currentTarget.dataset.basis
    if (basis === this.data.basis) return
    store.setBasis(basis)
    this.setData({ basis: basis, month: '', monthIndex: 0, currentMonthText: '全部月份' })
    this.loadMonths()
    this.refresh()
  },

  onMonthChange(e) {
    const i = Number(e.detail.value)
    const name = i === 0 ? '' : this.data.months[i - 1]
    this.setData({ monthIndex: i, month: name, currentMonthText: name || '全部月份' })
    this.refresh()
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
    this.refresh()
  },

  query() {
    return { month: this.data.month, monthBasis: this.data.basis, sortBy: this.data.basis }
  },

  refresh() {
    const q = this.query()
    const list = store.listInvoices(Object.assign({}, q, { keyword: this.data.keyword }))
    const statList = store.listInvoices(q)
    const sum = function (key) {
      return statList.reduce(function (s, inv) { return s + (Number(inv[key]) || 0) }, 0)
    }
    this.setData({
      invoices: list.map(toCard),
      totalCount: statList.length,
      totalText: store.yuan(sum('total_cent')),
      taxText: store.yuan(sum('tax_cent'))
    })
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' })
  },

  onScan() {
    const that = this
    collect.scanDrafts().then(function (r) { that.commit(r.drafts) })
  },

  onImport() {
    const that = this
    collect.fileDrafts().then(function (r) {
      if (!r.ok) return wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
      const drafts = r.results.filter(function (x) { return x.ok }).map(function (x) { return x.draft })
      that.commit(drafts)
    })
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
  },

  onExport() {
    wx.navigateTo({ url: '/pages/export/export' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  }
})

function toCard(inv) {
  return {
    id: inv.id,
    title: inv.seller_name || '未填销方',
    no: inv.invoice_no || '无号码',
    date: inv.issue_date || '日期待补',
    importText: importedText(inv.created_at),
    amountText: store.yuan(inv.total_cent),
    sourceText: sourceName(inv.source),
    sourceClass: inv.source === 'xml' || inv.source === 'ofd' ? '' : 'badge-grey',
    anomaly: (inv.anomaly || []).length,
    statusText: inv.status === 'manually_verified' ? '已核验' : '待核验'
  }
}
