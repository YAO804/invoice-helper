const lanservice = require('../../utils/lanservice')
const filesend = require('../../utils/filesend')

const RETENTION_DAYS = filesend.RETENTION_DAYS

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

Page({
  data: {
    connected: false,
    baseText: '未配置电脑地址',
    ledgerFileCount: 0,
    tab: 'sent',
    noun: '条记录',
    history: [],
    remote: [],
    remoteLoaded: false,
    remoteLoading: false,
    selectedIds: [],
    allSelected: false,
    currentCount: 0,
    retentionDays: RETENTION_DAYS
  },

  onShow() {
    filesend.purgeOldHistory()
    this.refreshStatus()
    this.refreshHistory()
    if (!this.data.remoteLoaded && lanservice.getBase()) this.loadRemote()
  },

  refreshStatus() {
    const base = lanservice.getBase()
    this.setData({
      connected: !!base,
      baseText: base ? ('电脑地址：' + base) : '未配置电脑地址',
      ledgerFileCount: filesend.ledgerFiles().length
    })
  },

  refreshHistory() {
    this.setData({ history: filesend.displayHistory() })
    this.syncSelection()
  },

  loadRemote() {
    if (this.data.remoteLoading) return Promise.resolve()
    if (!lanservice.getBase()) {
      this.setData({ remoteLoaded: true, remote: [] })
      return Promise.resolve()
    }

    const that = this
    this.setData({ remoteLoading: true })
    return filesend.remoteList().then(function (list) {
      that.setData({ remote: list, remoteLoaded: true, remoteLoading: false })
      that.syncSelection()
    }).catch(function (e) {
      that.setData({ remoteLoading: false })
      toast('读取电脑端文件失败：' + (e.message || '连接异常'))
    })
  },

  /** 勾选只在当前分段内有效，切分段即清空 */
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
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const ids = this.data.selectedIds.slice()
    const index = ids.indexOf(id)
    if (index < 0) ids.push(id)
    else ids.splice(index, 1)
    this.setData({ selectedIds: ids })
    this.syncSelection()
  },

  onToggleAll() {
    const ids = this.currentList().map(function (item) { return item.id })
    this.setData({ selectedIds: this.data.allSelected ? [] : ids })
    this.syncSelection()
  },

  currentList() {
    return this.data.tab === 'sent' ? this.data.history : this.data.remote
  },

  /** 给条目补 checked，并剔除已不存在的选中项 */
  syncSelection() {
    const ids = this.currentList().map(function (item) { return item.id })
    const selected = this.data.selectedIds.filter(function (id) { return ids.indexOf(id) >= 0 })
    const mark = function (item) {
      return Object.assign({}, item, { checked: selected.indexOf(item.id) >= 0 })
    }
    this.setData({
      selectedIds: selected,
      allSelected: ids.length > 0 && selected.length === ids.length,
      currentCount: ids.length,
      history: this.data.history.map(mark),
      remote: this.data.remote.map(mark)
    })
  },

  onDeleteSelected() {
    const that = this
    const ids = this.data.selectedIds
    if (!ids.length) return toast('还没有勾选')

    const sent = this.data.tab === 'sent'
    const content = sent
      ? '将删除本机 ' + ids.length + ' 条发送记录。只影响记录，电脑端已收到的文件不会删除。'
      : '将删除电脑端 ' + ids.length + ' 个已收文件。删除后不可恢复，手机里的台账记录不受影响。'

    confirmRemove('确认删除？', content, function () {
      if (sent) {
        filesend.removeHistory(ids)
        that.setData({ selectedIds: [] })
        that.refreshHistory()
        return toast('已删除 ' + ids.length + ' 条记录')
      }
      lanservice.deleteIncoming(ids).then(function (res) {
        that.setData({ selectedIds: [] })
        that.loadRemote()
        toast('已删除 ' + ((res && res.deleted) || ids.length) + ' 个文件')
      }).catch(function (e) {
        toast('删除失败：' + (e.message || '连接异常'))
      })
    })
  },

  onDeleteAll() {
    const that = this
    const sent = this.data.tab === 'sent'
    const count = this.currentList().length
    if (!count) return toast('没有可删除的内容')

    const content = sent
      ? '将清空本机 ' + count + ' 条发送记录。电脑端已收到的文件不受影响。'
      : '将删除电脑端全部 ' + count + ' 个已收文件。删除后不可恢复。'

    confirmRemove('全部删除？', content, function () {
      if (sent) {
        filesend.clearHistory()
        that.setData({ selectedIds: [] })
        that.refreshHistory()
        return toast('已清空记录')
      }
      lanservice.deleteIncoming([]).then(function (res) {
        that.setData({ selectedIds: [] })
        that.loadRemote()
        toast('已删除 ' + ((res && res.deleted) || count) + ' 个文件')
      }).catch(function (e) {
        toast('删除失败：' + (e.message || '连接异常'))
      })
    })
  },

  /** 清理超过保留期的内容：本机记录直接丢，电脑端先预览再删 */
  onPurgeOld() {
    if (this.data.tab === 'sent') {
      const removed = filesend.purgeOldHistory()
      this.refreshHistory()
      return toast(removed ? '已清理 ' + removed + ' 条超期记录' : '没有超过 ' + RETENTION_DAYS + ' 天的记录')
    }

    if (!lanservice.getBase()) return toast('请先连接电脑')
    const that = this
    lanservice.purgeIncoming(RETENTION_DAYS, false).then(function (preview) {
      const removed = (preview && preview.removed) || 0
      if (!removed) return toast('电脑端没有超过 ' + RETENTION_DAYS + ' 天的文件')
      confirmRemove(
        '清理超期文件？',
        '电脑端有 ' + removed + ' 个文件超过 ' + RETENTION_DAYS + ' 天，将全部删除且不可恢复。',
        function () {
          lanservice.purgeIncoming(RETENTION_DAYS, true).then(function (res) {
            that.loadRemote()
            toast('已清理 ' + ((res && res.removed) || removed) + ' 个文件')
          }).catch(function (e) {
            toast('清理失败：' + (e.message || '连接异常'))
          })
        }
      )
    }).catch(function (e) {
      toast('清理失败：' + (e.message || '连接异常'))
    })
  },

  onRefreshRemote() {
    if (!lanservice.getBase()) return toast('请先连接电脑')
    this.loadRemote()
  },

  onFromChat() {
    const that = this
    if (!lanservice.getBase()) return toast('请先连接电脑')
    wx.showLoading({ title: '上传中', mask: true })
    filesend.sendFromChat().then(function (r) {
      wx.hideLoading()
      that.refreshHistory()
      if (r.error) return toast(r.error)
      wx.showModal({
        title: '上传完成',
        content: '成功 ' + r.ok + ' 个' +
          (r.duplicate ? '\n电脑端已有 ' + r.duplicate + ' 个' : '') +
          (r.fail ? '\n失败 ' + r.fail + ' 个' : ''),
        showCancel: false,
        success: function () { that.loadRemote() }
      })
    })
  },

  onFromLedger() {
    const that = this
    if (!lanservice.getBase()) return toast('请先连接电脑')
    if (!filesend.ledgerFiles().length) return toast('台账里没有已存原件')

    wx.showLoading({ title: '上传中', mask: true })
    filesend.sendLedgerFiles().then(function (r) {
      wx.hideLoading()
      that.refreshHistory()
      wx.showModal({
        title: '上传完成',
        content: '共 ' + r.total + ' 个原件：成功 ' + r.ok +
          (r.duplicate ? '、已存在 ' + r.duplicate : '') + '、失败 ' + r.fail,
        showCancel: false,
        success: function () { that.loadRemote() }
      })
    })
  }
})
