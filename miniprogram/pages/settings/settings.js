const store = require('../../utils/store')
const lanservice = require('../../utils/lanservice')

Page({
  data: {
    basis: 'created',
    reviewCount: 0,
    desktopUrl: '',
    desktopStatus: '未配置'
  },

  onShow() {
    const url = lanservice.getBase()
    this.setData({
      basis: store.getBasis(),
      reviewCount: store.reviewList().length,
      desktopUrl: url,
      desktopStatus: url ? '已配置' : '未配置'
    })
  },

  onBasisChange(e) {
    const basis = e.currentTarget.dataset.basis
    if (basis === this.data.basis) return
    store.setBasis(basis)
    this.setData({ basis: basis })
    wx.showToast({ title: '已切换排序口径', icon: 'none' })
  },

  onDesktopUrlInput(e) {
    this.setData({ desktopUrl: e.detail.value })
  },

  onSaveDesktop() {
    const url = lanservice.setBase(this.data.desktopUrl)
    if (!url) {
      this.setData({ desktopStatus: '未配置' })
      wx.showToast({ title: '请先填写地址', icon: 'none' })
      return
    }
    lanservice.startAutoHeartbeat()
    this.setData({ desktopUrl: url, desktopStatus: '已配置' })
    wx.showToast({ title: '已保存', icon: 'none' })
  },

  async onTestDesktop() {
    const url = lanservice.setBase(this.data.desktopUrl)
    if (!url) {
      wx.showToast({ title: '请先填写地址', icon: 'none' })
      return
    }
    this.setData({ desktopUrl: url, desktopStatus: '测试中' })
    try {
      await lanservice.heartbeat()
      this.setData({ desktopStatus: '连接成功' })
      wx.showToast({ title: '连接成功', icon: 'none' })
    } catch (e) {
      this.setData({ desktopStatus: '连接失败' })
      wx.showToast({ title: e.message || '连接失败', icon: 'none' })
    }
  },

  onReview() {
    wx.navigateTo({ url: '/pages/review/review' })
  },

  onExport() {
    wx.navigateTo({ url: '/pages/export/export' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  }
})
