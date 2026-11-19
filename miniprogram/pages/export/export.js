/**
 * 导出页：台账在电脑上，所以 CSV 由电脑端生成，微信只负责把文件转发出去。
 *
 * 流程：wx.downloadFile 拉电脑端的 /api/invoices/export → 转发到聊天
 * （可以发给自己的「文件传输助手」，再从聊天里用 Excel 打开）。
 */

const ledger = require('../../utils/ledger')
const lanservice = require('../../utils/lanservice')
const exportflow = require('../../utils/exportflow')

const SCOPES = [
  { key: 'all', name: '全部台账', onlyDuplicates: false, onlyNeedFill: false },
  { key: 'duplicates', name: '仅重复', onlyDuplicates: true, onlyNeedFill: false },
  { key: 'needFill', name: '仅待补录', onlyDuplicates: false, onlyNeedFill: true }
]

function scopesOf(active) {
  return SCOPES.map(function (scope) {
    return { key: scope.key, name: scope.name, on: scope.key === active }
  })
}

function fileName() {
  const d = new Date()
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return '发票台账-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv'
}

Page({
  data: {
    status: 'none',
    baseText: '',
    scopes: scopesOf('all'),
    scope: 'all',
    count: 0,
    amountText: '0.00',
    loading: false,
    exporting: false
  },

  onShow() {
    const base = lanservice.getBase()
    this.setData({ status: base ? 'checking' : 'none', baseText: base || '' })
    if (!base) return
    const that = this
    // 存过地址不代表连得上：先探活，通过才拉台账。否则界面会先说「连上了」再弹失败 toast。
    lanservice.probe().then(function (ok) {
      if (!ok) return that.setData({ status: 'fail' })
      that.setData({ status: 'ok' })
      that.preview()
    })
  },

  current() {
    for (let i = 0; i < SCOPES.length; i++) {
      if (SCOPES[i].key === this.data.scope) return SCOPES[i]
    }
    return SCOPES[0]
  },

  preview() {
    const that = this
    const scope = this.current()
    this.setData({ loading: true })
    return ledger.sync({
      onlyDuplicates: scope.onlyDuplicates,
      onlyNeedFill: scope.onlyNeedFill,
      sort: 'created'
    }).then(function (snap) {
      that.setData({ count: snap.total, amountText: snap.amountText, loading: false })
    }).catch(function (error) {
      that.setData({ loading: false })
      wx.showToast({ title: error.message || '读取电脑台账失败', icon: 'none' })
    })
  },

  onScopeChange(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.scope) return
    this.setData({ scope: key, scopes: scopesOf(key) })
    this.preview()
  },

  onExport() {
    if (this.data.exporting) return
    if (this.data.status !== 'ok') return wx.showToast({ title: '还没连上电脑', icon: 'none' })
    const scope = this.current()
    const url = lanservice.exportURL(ledger.buildQuery({
      onlyDuplicates: scope.onlyDuplicates,
      onlyNeedFill: scope.onlyNeedFill,
      sort: 'created'
    }))
    if (!url) return wx.showToast({ title: '请先连接电脑', icon: 'none' })
    if (!this.data.count) return wx.showToast({ title: '这个范围没有发票', icon: 'none' })

    const that = this
    this.setData({ exporting: true })
    wx.showLoading({ title: '从电脑端导出', mask: true })

    wx.downloadFile({
      url: url,
      header: lanservice.authHeader(),
      success: function (res) {
        wx.hideLoading()
        that.setData({ exporting: false })
        if (res.statusCode !== 200 || !res.tempFilePath) {
          return wx.showToast({ title: '导出失败：HTTP ' + res.statusCode, icon: 'none' })
        }
        exportflow.run([{ name: fileName(), path: res.tempFilePath }]).then(function (r) {
          if (r.cancelled) return wx.showToast({ title: '已取消转发', icon: 'none' })
          if (!r.ok) {
            return wx.showToast({ title: '转发失败：' + (r.message || ''), icon: 'none', duration: 2500 })
          }
          wx.showToast({ title: '已转发 ' + that.data.count + ' 张', icon: 'none' })
        })
      },
      fail: function (err) {
        wx.hideLoading()
        that.setData({ exporting: false })
        wx.showToast({ title: (err && err.errMsg) || '下载失败', icon: 'none', duration: 2500 })
      }
    })
  },

  onConnect() {
    wx.switchTab({ url: '/pages/settings/settings' })
  }
})
