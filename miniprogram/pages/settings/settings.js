const lanservice = require('../../utils/lanservice')
const discover = require('../../utils/discover')

Page({
  data: {
    desktopUrl: '',
    desktopStatus: '未配置',
    canDiscover: false,
    discovering: false,
    scanning: false,
    discoverTip: ''
  },

  onShow() {
    const url = lanservice.getBase()
    this.setData({
      desktopUrl: url,
      desktopStatus: url ? '已配置' : '未配置',
      canDiscover: discover.supported()
    })
  },

  onHide() { discover.cancel() },

  onUnload() { discover.cancel() },

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

  async onDiscover() {
    if (this.data.discovering) return
    this.setData({ discovering: true, discoverTip: '正在搜索同一局域网的电脑…' })
    try {
      const url = await lanservice.autoConnect({ settleMs: 2500 })
      this.setData({
        desktopUrl: url,
        desktopStatus: '已自动连接',
        discoverTip: '已找到电脑：' + url,
        discovering: false
      })
      wx.showToast({ title: '已自动连接', icon: 'none' })
    } catch (e) {
      this.setData({
        discoverTip: e.message || '没有找到电脑，请手动填写地址',
        discovering: false
      })
    }
  },

  onCancelDiscover() {
    discover.cancel()
    this.setData({ discovering: false, discoverTip: '已停止搜索' })
  },

  /** 扫码兜底：扫电脑端网页上的二维码，比手输地址可靠，iOS 也能用 */
  async onScanConnect() {
    if (this.data.scanning) return
    this.setData({ scanning: true, discoverTip: '正在扫码…' })
    try {
      const url = await discover.scanConnectCode()
      lanservice.setBase(url)
      lanservice.startAutoHeartbeat()
      this.setData({
        desktopUrl: url,
        desktopStatus: '已扫码连接',
        discoverTip: '已连接电脑：' + url,
        scanning: false
      })
      wx.showToast({ title: '已连接电脑', icon: 'none' })
    } catch (e) {
      this.setData({
        discoverTip: e.message || '扫码连接失败，请手动填写地址',
        scanning: false
      })
    }
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

  onExport() {
    wx.navigateTo({ url: '/pages/export/export' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  }
})
