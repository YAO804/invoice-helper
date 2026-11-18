/**
 * 台账页：电脑端台账的只读视图。
 *
 * 小程序不存台账，进页面就去问电脑端要；筛选和排序也由电脑端算，
 * 两端只有一套口径。这里能做的只有「看」和「跳详情」，
 * 增删改都在电脑端网页。
 */

const ledger = require('../../utils/ledger')
const lanservice = require('../../utils/lanservice')

const SEARCH_DELAY = 300
const SORT_LABELS = [
  { value: 'created', label: '录入时间' },
  { value: 'number', label: '发票号码' },
  { value: 'issued', label: '开票日期' },
  { value: 'reimburser', label: '报销人' }
]

let searchTimer = null

function clockText(ts) {
  const d = new Date(Number(ts) || 0)
  if (!Number(ts)) return ''
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return '更新于 ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

Page({
  data: {
    connected: false,
    baseText: '',
    keyword: '',
    onlyDuplicates: false,
    onlyNeedFill: false,
    sort: 'created',
    sorts: SORT_LABELS.map(function (item) {
      return Object.assign({ on: item.value === 'created' }, item)
    }),
    hasFilter: false,
    items: [],
    total: 0,
    amountText: '0.00',
    duplicateGroups: 0,
    needFill: 0,
    latestBatch: '',
    loading: false,
    error: '',
    syncedText: ''
  },

  onShow() {
    // 收票页「查看这批票」把批次号放在 globalData 带过来，只看这一次，读完就清
    if (typeof getApp === 'function') {
      const app = getApp()
      const pending = app && app.globalData && app.globalData.pendingBatch
      if (pending) {
        app.globalData.pendingBatch = ''
        this.syncFilterState({ keyword: pending })
      }
    }
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh().then(function () { wx.stopPullDownRefresh() })
  },

  onUnload() {
    clearTimeout(searchTimer)
  },

  /** 未连接就直接给空状态，不打无用的请求 */
  refresh() {
    const base = lanservice.getBase()
    if (!base) {
      ledger.clear()
      this.setData({
        connected: false,
        baseText: '',
        items: [],
        total: 0,
        amountText: '0.00',
        duplicateGroups: 0,
        needFill: 0,
        latestBatch: '',
        loading: false,
        error: ''
      })
      return Promise.resolve()
    }

    this.setData({ connected: true, baseText: base, loading: true, error: '' })
    return this.load()
  },

  load() {
    const that = this
    return ledger.sync(this.filters()).then(function (snap) {
      that.setData({
        items: snap.items,
        total: snap.total,
        amountText: snap.amountText,
        duplicateGroups: snap.duplicateGroups,
        needFill: snap.needFill,
        latestBatch: snap.latestBatch,
        syncedText: clockText(snap.syncedAt),
        loading: false
      })
    }).catch(function (error) {
      ledger.clear()
      that.setData({
        items: [],
        total: 0,
        amountText: '0.00',
        duplicateGroups: 0,
        needFill: 0,
        latestBatch: '',
        loading: false,
        error: error.message || '读取电脑台账失败'
      })
    })
  },

  filters() {
    return {
      keyword: this.data.keyword,
      onlyDuplicates: this.data.onlyDuplicates,
      onlyNeedFill: this.data.onlyNeedFill,
      sort: this.data.sort
    }
  },

  syncFilterState(patch) {
    const next = Object.assign({}, this.data, patch)
    this.setData(Object.assign({
      hasFilter: !!(String(next.keyword || '').trim() || next.onlyDuplicates || next.onlyNeedFill)
    }, patch))
  },

  onKeywordInput(e) {
    const that = this
    this.syncFilterState({ keyword: e.detail.value })
    // 打字时每次都请求会把电脑端打满，停顿一下再查
    clearTimeout(searchTimer)
    searchTimer = setTimeout(function () { that.load() }, SEARCH_DELAY)
  },

  onToggleDuplicates() {
    this.syncFilterState({ onlyDuplicates: !this.data.onlyDuplicates })
    this.load()
  },

  onToggleNeedFill() {
    this.syncFilterState({ onlyNeedFill: !this.data.onlyNeedFill })
    this.load()
  },

  /** 一键回看最近一次发送的那批票；再点一次取消 */
  onLatestBatch() {
    const batch = this.data.latestBatch
    if (!batch) return
    this.syncFilterState({ keyword: this.data.keyword === batch ? '' : batch })
    this.load()
  },

  onSortChange(e) {
    const sort = e.currentTarget.dataset.sort
    if (sort === this.data.sort) return
    this.setData({
      sort: sort,
      sorts: SORT_LABELS.map(function (item) {
        return Object.assign({ on: item.value === sort }, item)
      })
    })
    this.load()
  },

  onReset() {
    this.setData({
      keyword: '',
      onlyDuplicates: false,
      onlyNeedFill: false,
      hasFilter: false
    })
    this.load()
  },

  onOpenDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id })
  },

  onConnect() {
    // 设置页是 tabBar 页面，只能 switchTab
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  onCollect() {
    wx.switchTab({ url: '/pages/collect/collect' })
  }
})
