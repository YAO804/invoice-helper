const store = require('../../utils/store')
const stats = require('../../utils/stats')

Page({
  data: {
    months: [],
    monthOptions: ['全部月份'],
    monthIndex: 0,
    month: '',
    currentMonthText: '全部月份',
    count: 0,
    totalText: '0.00',
    categories: [],
    sources: []
  },

  onLoad() { this.loadMonths() },
  onShow() { this.refresh() },

  loadMonths() {
    const months = store.months(store.getBasis())
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
    const list = store.listInvoices({
      month: this.data.month,
      monthBasis: store.getBasis(),
      sortBy: store.getSort()
    })
    const sum = stats.summary(list)
    this.setData({
      count: sum.count,
      totalText: store.yuan(sum.totalCent),
      categories: stats.byCategory(list),
      sources: stats.bySource(list)
    })
  }
})
