const store = require('../../utils/store')
const category = require('../../utils/category')
const labels = require('../../utils/labels')

function categoryChips(active) {
  return ['全部'].concat(category.CATEGORIES).map(function (name) {
    const value = name === '全部' ? '' : name
    return { name: name, value: value, on: value === active }
  })
}

Page({
  data: {
    sortBy: 'created',
    basis: 'created',
    categoryChips: categoryChips(''),
    categoryFilter: '',
    months: [],
    monthOptions: ['全部月份'],
    monthIndex: 0,
    month: '',
    keyword: '',
    invoices: [],
    totalCount: 0,
    totalText: '0.00',
    reviewCount: 0,
    currentMonthText: '全部月份'
  },

  onLoad() {
    this.setData({ sortBy: store.getSort(), basis: store.getBasis() })
    this.loadMonths()
  },
  onShow() { this.loadMonths(); this.refresh() },

  loadMonths() {
    const months = store.months(this.data.basis)
    this.setData({ months: months, monthOptions: ['全部月份'].concat(months) })
  },

  onSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    if (sortBy === this.data.sortBy) return
    store.setSort(sortBy)
    this.setData({ sortBy: sortBy })
    this.refresh()
  },

  onCategoryChange(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ categoryFilter: value === '全部' ? '' : value })
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

  refresh() {
    const filter = {
      month: this.data.month,
      monthBasis: this.data.basis,
      sortBy: this.data.sortBy,
      category: this.data.categoryFilter
    }
    const list = store.listInvoices(Object.assign({}, filter, { keyword: this.data.keyword }))
    const statList = store.listInvoices(filter)
    this.setData({
      invoices: list.map(toCard),
      categoryChips: categoryChips(this.data.categoryFilter),
      totalCount: statList.length,
      totalText: store.yuan(statList.reduce(function (s, inv) { return s + (Number(inv.total_cent) || 0) }, 0)),
      reviewCount: store.reviewList().length
    })
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  onLongPress(e) {
    const that = this
    const id = Number(e.currentTarget.dataset.id)
    wx.showActionSheet({
      itemList: ['查看详情', '编辑', '删除这张'],
      success(res) {
        if (res.tapIndex === 0) that.openDetail(id)
        else if (res.tapIndex === 1) wx.navigateTo({ url: '/pages/edit/edit?id=' + id })
        else if (res.tapIndex === 2) that.confirmDelete(id)
      }
    })
  },

  openDetail(id) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  confirmDelete(id) {
    const that = this
    wx.showModal({
      title: '删除这张记录？',
      content: '只删台账记录，不删原件文件。删除后无法恢复。',
      confirmColor: '#b42318',
      success(res) {
        if (!res.confirm) return
        store.deleteInvoice(id)
        wx.showToast({ title: '已删除', icon: 'none' })
        that.refresh()
      }
    })
  },

  onManage() {
    wx.navigateTo({ url: '/pages/manage/manage' })
  },

  onReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' })
  }
})

function toCard(inv) {
  const cat = inv.category || '未分类'
  return {
    id: inv.id,
    title: inv.reimburser || inv.invoice_no || '未填报销人',
    no: inv.invoice_no || '无号码',
    date: inv.issue_date || '日期待补',
    importText: labels.importText(inv.created_at),
    amountText: store.yuan(inv.total_cent),
    sourceText: labels.sourceName(inv.source),
    sourceClass: inv.source === 'xml' || inv.source === 'ofd' ? '' : 'badge-grey',
    categoryText: cat,
    categoryClass: cat === '未分类' ? 'badge-grey' : '',
    anomaly: (inv.anomaly || []).length,
    statusText: inv.status === 'manually_verified' ? '已核验' : '待核验'
  }
}
