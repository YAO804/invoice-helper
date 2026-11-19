/**
 * 台账页：电脑端台账的只读视图。
 *
 * 小程序不存台账，进页面就去问电脑端要；筛选和排序也由电脑端算，
 * 两端只有一套口径。这里能做的只有「看」和「跳详情」，
 * 增删改都在电脑端网页。
 *
 * 录入批次是内部概念，界面上一律不出现：收票页发完一批只在内存里
 * 记一个批次号（globalData.pendingBatch），台账页拿它收敛列表，
 * 用户看到的是「这一批」这种说法，不是批次号。
 */

const ledger = require('../../utils/ledger')
const lanservice = require('../../utils/lanservice')

const SEARCH_DELAY = 300
// short 是分段控件里显示的短标签：四个选项并排，全称会挤成两行
const SORT_LABELS = [
  { value: 'created', label: '录入时间', short: '录入' },
  { value: 'number', label: '发票号码', short: '号码' },
  { value: 'issued', label: '开票日期', short: '开票' },
  { value: 'reimburser', label: '报销人', short: '报销' }
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
    // 收票页带过来的批次号，只在内存里过滤用，不展示
    batchFilter: '',
    createdFrom: '',
    createdTo: '',
    onlyDuplicates: false,
    onlyNeedFill: false,
    sort: 'created',
    sorts: SORT_LABELS.map(function (item) {
      return Object.assign({ on: item.value === 'created' }, item)
    }),
    // 筛选状态派生值：有没有条件、是不是正好只看「最近录入」那天
    hasFilter: false,
    latestOn: false,
    // 日期 pill 的文字：没选时显示「录入起 / 录入止」，选了直接显示日期
    fromText: '录入起',
    toText: '录入止',
    items: [],
    total: 0,
    amountText: '0.00',
    duplicateGroups: 0,
    needFill: 0,
    latestCreatedAt: '',
    loading: false,
    error: '',
    syncedText: ''
  },

  onShow() {
    // 收票页「查看这批票」把批次号放在 globalData 带过来，只看这一次，读完就清
    const app = typeof getApp === 'function' ? getApp() : null
    const pending = app && app.globalData ? app.globalData.pendingBatch : ''
    if (pending) {
      app.globalData.pendingBatch = ''
      this.syncFilterState({ batchFilter: pending })
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
        latestCreatedAt: '',
        latestOn: false,
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
      const latest = snap.latestCreatedAt
      that.setData({
        items: snap.items,
        total: snap.total,
        amountText: snap.amountText,
        duplicateGroups: snap.duplicateGroups,
        needFill: snap.needFill,
        latestCreatedAt: latest,
        latestOn: !!latest && that.data.createdFrom === latest && that.data.createdTo === latest,
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
        latestCreatedAt: '',
        latestOn: false,
        loading: false,
        error: error.message || '读取电脑台账失败'
      })
    })
  },

  filters() {
    return {
      keyword: this.data.keyword,
      batch: this.data.batchFilter,
      createdFrom: this.data.createdFrom,
      createdTo: this.data.createdTo,
      onlyDuplicates: this.data.onlyDuplicates,
      onlyNeedFill: this.data.onlyNeedFill,
      sort: this.data.sort
    }
  },

  /** 改筛选条件时顺带把派生状态算好，页面不用自己维护高亮 */
  syncFilterState(patch) {
    const next = Object.assign({}, this.data, patch)
    const latest = String(next.latestCreatedAt || '')
    const from = String(next.createdFrom || '')
    const to = String(next.createdTo || '')
    this.setData(Object.assign({
      hasFilter: !!(
        String(next.keyword || '').trim() || next.batchFilter ||
        from || to || next.onlyDuplicates || next.onlyNeedFill
      ),
      latestOn: !!latest && from === latest && to === latest,
      fromText: from ? '起 ' + from : '录入起',
      toText: to ? '止 ' + to : '录入止'
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

  /** 「最近录入」是一个日期开关：点一下只看那天，再点一下清空 */
  onLatestCreated() {
    const date = this.data.latestCreatedAt
    if (!date) return
    const already = this.data.createdFrom === date && this.data.createdTo === date
    this.syncFilterState({
      createdFrom: already ? '' : date,
      createdTo: already ? '' : date
    })
    this.load()
  },

  onCreatedFromChange(e) {
    this.syncFilterState({ createdFrom: e.detail.value || '' })
    this.load()
  },

  onCreatedToChange(e) {
    this.syncFilterState({ createdTo: e.detail.value || '' })
    this.load()
  },

  onClearCreated() {
    this.syncFilterState({ createdFrom: '', createdTo: '' })
    this.load()
  },

  onClearBatch() {
    this.syncFilterState({ batchFilter: '' })
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
    this.syncFilterState({
      keyword: '',
      batchFilter: '',
      createdFrom: '',
      createdTo: '',
      onlyDuplicates: false,
      onlyNeedFill: false
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
