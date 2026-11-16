const review = require('../../utils/review')

Page({
  data: { list: [] },

  onShow() { this.refresh() },

  refresh() {
    this.setData({ list: review.cards() })
  },

  onOpen(e) {
    wx.navigateTo({ url: '/pages/edit/edit?id=' + e.currentTarget.dataset.id })
  },

  onCollect() {
    wx.switchTab({ url: '/pages/collect/collect' })
  }
})
