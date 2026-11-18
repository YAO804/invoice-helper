/**
 * 发票详情：只读。
 *
 * 数据来自台账页同步下来的内存镜像，页面本身不再读盘。
 * 直接进来（比如从分享/调试链接）时镜像可能还没建，先拉一次再取。
 */

const ledger = require('../../utils/ledger')
const lanservice = require('../../utils/lanservice')

Page({
  data: {
    item: null,
    group: [],
    groupMore: 0,
    connected: false
  },

  onLoad(options) {
    this.invId = Number(options.id)
    this.load()
  },

  load() {
    const that = this
    const found = ledger.byId(this.invId)
    if (found) return this.render(found)

    if (!lanservice.getBase()) return this.missing()
    ledger.sync({}).then(function () {
      const again = ledger.byId(that.invId)
      if (again) that.render(again)
      else that.missing()
    }).catch(function () { that.missing() })
  },

  render(invoice) {
    const group = ledger.duplicateGroup(invoice.id).map(function (item) {
      return {
        id: item.id,
        number: item.number || '',
        code: item.code || '',
        total: item.total || '',
        batch: item.batch || '',
        createdAt: item.created_at || '',
        self: Number(item.id) === Number(invoice.id)
      }
    })

    this.setData({
      item: {
        id: invoice.id,
        number: invoice.number || '',
        code: invoice.code || '',
        kind: invoice.kind || '',
        issueDate: invoice.issue_date || '',
        amount: invoice.total || '',
        reimburser: invoice.reimburser || '',
        batch: invoice.batch || '',
        createdAt: invoice.created_at || '',
        duplicate: !!invoice.duplicate,
        needFill: !!invoice.need_fill
      },
      group: group,
      groupMore: Math.max(group.length - 1, 0),
      connected: true
    })
  },

  missing() {
    wx.showToast({ title: '记录不存在或电脑未连接', icon: 'none' })
    setTimeout(function () { wx.navigateBack() }, 900)
  },

  onCopy(e) {
    const value = e.currentTarget.dataset.value || ''
    if (!value) return
    wx.setClipboardData({ data: value })
  }
})
