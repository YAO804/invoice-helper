const store = require('../../utils/store')

Page({
  data: {
    basis: 'created',
    reviewCount: 0
  },

  onShow() {
    this.setData({
      basis: store.getBasis(),
      reviewCount: store.reviewList().length
    })
  },

  onBasisChange(e) {
    const basis = e.currentTarget.dataset.basis
    if (basis === this.data.basis) return
    store.setBasis(basis)
    this.setData({ basis: basis })
    wx.showToast({ title: '已切换排序口径', icon: 'none' })
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
