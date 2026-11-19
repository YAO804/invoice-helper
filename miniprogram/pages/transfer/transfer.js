/**
 * 传输中心：一个页面看两个方向。
 *
 *   发到电脑 —— 本机发送记录 / 电脑已收
 *   从电脑取 —— 电脑待取区里的文件
 *
 * 这里只放壳：状态、方向切换、勾选、删除与清理的编排。
 * 两个方向各自的加载与交互分别混在 ./to-side.js、./from-side.js，
 * 免得一个文件里堆两套几乎对称的逻辑。
 */

const lanservice = require('../../utils/lanservice')
const filesend = require('../../utils/filesend')
const selection = require('../../utils/selection')
const transferops = require('../../utils/transferops')

const toSide = require('./to-side')
const fromSide = require('./from-side')

const RETENTION_DAYS = transferops.RETENTION_DAYS

function toast(title) {
  wx.showToast({ title: title, icon: 'none', duration: 2500 })
}

function confirmRemove(title, content, done) {
  wx.showModal({
    title: title,
    content: content,
    confirmColor: '#b42318',
    confirmText: '删除',
    success: function (res) { if (res.confirm) done() }
  })
}

const page = {
  data: {
    connected: false,
    baseText: '未配置电脑地址',
    direction: 'to',   // to=发到电脑，from=从电脑取
    tab: 'sent',       // 仅发到电脑：sent=我的上传，remote=电脑已收
    noun: '条记录',
    history: [],
    remote: [],
    remoteLoaded: false,
    remoteLoading: false,
    offer: [],
    offerLoaded: false,
    offerLoading: false,
    selectedIds: [],
    allSelected: false,
    currentCount: 0,
    retentionDays: RETENTION_DAYS
  },

  onShow() {
    filesend.purgeOldHistory()
    this.refreshStatus()
    this.refreshHistory()
    this.refreshCurrent()
  },

  /** 徽标只认探活结果：存过地址不等于连得上，电脑关机了要老实说未连接 */
  refreshStatus() {
    const base = lanservice.getBase()
    this.setData({
      connected: false,
      baseText: base ? ('电脑地址：' + base) : '未配置电脑地址'
    })
    if (!base) return Promise.resolve(false)

    const that = this
    return lanservice.probe().then(function (ok) {
      that.setData({ connected: !!ok })
      return !!ok
    })
  },

  /** 只加载当前方向要看的那一份，切过去时不会白跑另一边的请求 */
  refreshCurrent() {
    if (!lanservice.getBase()) return Promise.resolve()
    if (this.data.direction === 'from') return this.loadOffer()
    return this.data.tab === 'remote' ? this.loadRemote() : Promise.resolve()
  },

  currentList() {
    if (this.data.direction === 'from') return this.data.offer
    return this.data.tab === 'sent' ? this.data.history : this.data.remote
  },

  scope() {
    return transferops.scopeOf(this.data.direction, this.data.tab)
  },

  onDirection(e) {
    const direction = e.currentTarget.dataset.direction
    if (direction === this.data.direction) return

    this.setData({
      direction: direction,
      noun: direction === 'from' ? '个文件' : (this.data.tab === 'sent' ? '条记录' : '个文件'),
      selectedIds: [],
      allSelected: false
    })
    this.syncSelection()
    this.refreshCurrent()
  },

  /** 勾选只在当前列表内有效，切分段/方向即清空 */
  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return

    this.setData({
      tab: tab,
      noun: tab === 'sent' ? '条记录' : '个文件',
      selectedIds: [],
      allSelected: false
    })
    this.syncSelection()
    this.refreshCurrent()
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ selectedIds: selection.toggle(this.data.selectedIds, id) })
    this.syncSelection()
  },

  onToggleAll() {
    const ids = this.currentList().map(function (item) { return item.id })
    this.setData({ selectedIds: this.data.allSelected ? [] : ids })
    this.syncSelection()
  },

  /** 给条目补 checked，并剔除已不在列表里的选中项 */
  syncSelection() {
    const list = this.currentList()
    const ids = list.map(function (item) { return item.id })
    const selected = selection.prune(this.data.selectedIds, ids)

    this.setData({
      selectedIds: selected,
      allSelected: selection.allSelected(list, selected),
      currentCount: ids.length,
      history: selection.mark(this.data.history, selected),
      remote: selection.mark(this.data.remote, selected),
      offer: selection.mark(this.data.offer, selected)
    })
  },

  onRefresh() {
    if (!lanservice.getBase()) return toast('请先连接电脑')
    this.refreshCurrent()
  },

  /** 删除选中 / 全部删除走同一流程，只差按 id 还是整体 */
  onDelete(e) {
    const all = e.currentTarget.dataset.all === 'all'
    const ids = this.data.selectedIds
    const list = this.currentList()
    if (all && !list.length) return toast('没有可删除的内容')
    if (!all && !ids.length) return toast('还没有勾选')

    const that = this
    const scope = this.scope()
    const count = all ? list.length : ids.length
    const content = all
      ? transferops.removeAllText(scope, count)
      : transferops.removeText(scope, count)

    confirmRemove(all ? '全部删除？' : '确认删除？', content, function () {
      const task = all ? transferops.removeAll(scope) : transferops.remove(scope, ids)
      task.then(function (res) {
        that.setData({ selectedIds: [] })
        if (scope === 'local') that.refreshHistory()
        else that.refreshCurrent()
        toast('已删除 ' + ((res && res.deleted) || count) + ' ' + transferops.unit(scope))
      }).catch(function (err) {
        toast('删除失败：' + (err.message || '连接异常'))
      })
    })
  },

  /** 清理超过保留期的内容：本机记录直接丢，电脑上的先预览再删 */
  onPurgeOld() {
    const scope = this.scope()

    if (scope === 'local') {
      const removed = filesend.purgeOldHistory()
      this.refreshHistory()
      return toast(removed ? '已清理 ' + removed + ' 条超期记录' : '没有超过 ' + RETENTION_DAYS + ' 天的记录')
    }
    if (!lanservice.getBase()) return toast('请先连接电脑')

    const that = this
    const what = transferops.purgeName(scope)
    transferops.purge(scope, RETENTION_DAYS, false).then(function (preview) {
      const removed = (preview && preview.removed) || 0
      if (!removed) return toast('电脑端没有超过 ' + RETENTION_DAYS + ' 天的' + what)

      confirmRemove(
        '清理超期' + what + '？',
        '电脑端有 ' + removed + ' 个' + what + '超过 ' + RETENTION_DAYS + ' 天，将全部删除且不可恢复。',
        function () {
          transferops.purge(scope, RETENTION_DAYS, true).then(function (res) {
            that.refreshCurrent()
            toast('已清理 ' + ((res && res.removed) || removed) + ' 个' + what)
          }).catch(function (err) {
            toast('清理失败：' + (err.message || '连接异常'))
          })
        }
      )
    }).catch(function (err) {
      toast('清理失败：' + (err.message || '连接异常'))
    })
  }
}

Page(Object.assign(page, toSide, fromSide))
