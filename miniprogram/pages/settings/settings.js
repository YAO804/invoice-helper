const lanservice = require('../../utils/lanservice')
const discover = require('../../utils/discover')
const auth = require('../../utils/auth')

Page({
  data: {
    desktopUrl: '',
    desktopStatus: '未配置',
    canDiscover: false,
    discovering: false,
    scanning: false,
    discoverTip: '',
    pinSet: false,
    pinMask: ''
  },

  onShow() {
    const url = lanservice.getBase()
    this.refreshPINStatus()
    this.setData({
      desktopUrl: url,
      desktopStatus: url ? '已配置' : '未配置',
      canDiscover: discover.supported()
    })
  },

  refreshPINStatus() {
    const set = auth.hasPIN()
    this.setData({ pinSet: set, pinMask: set ? '已设置（******）' : '未设置' })
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

  /** 扫电脑网页的登录二维码：一次扫码同时连地址 + 授权网页登录 */
  async onScanLogin() {
    if (this.data.scanning) return
    if (!auth.hasPIN()) {
      wx.showToast({ title: '请先设置 PIN', icon: 'none' })
      return
    }
    this.setData({ scanning: true, discoverTip: '正在扫码登录电脑…' })
    try {
      const base = await auth.scanLoginCode()
      lanservice.setBase(base)
      lanservice.startAutoHeartbeat()
      this.setData({
        desktopUrl: base,
        desktopStatus: '已扫码登录',
        discoverTip: '已登录电脑网页，可切到浏览器查看',
        scanning: false
      })
      wx.showToast({ title: '登录成功', icon: 'none' })
    } catch (e) {
      this.setData({ discoverTip: e.message || '扫码登录失败', scanning: false })
    }
  },

  /** 首次设置 PIN：存在本机，之后所有请求自动带，无感登录 */
  onSetupPIN() {
    wx.showModal({
      title: '设置 PIN',
      content: '请输入 4 位以上数字，用于连接电脑端',
      editable: true,
      placeholderText: '例如 123456',
      success: (res) => {
        if (!res.confirm) return
        const pin = String(res.content || '').trim()
        if (pin.length < 4) {
          wx.showToast({ title: 'PIN 至少 4 位', icon: 'none' })
          return
        }
        auth.setPIN(pin)
        this.refreshPINStatus()
        wx.showToast({ title: 'PIN 已保存', icon: 'none' })
      }
    })
  },

  /** 修改 PIN：需带当前 PIN，改完服务端旧会话全部失效 */
  onChangePIN() {
    const base = lanservice.getBase()
    if (!base || !auth.hasPIN()) {
      wx.showToast({ title: '请先连接电脑并设置 PIN', icon: 'none' })
      return
    }
    wx.showModal({
      title: '当前 PIN',
      content: '请输入当前 PIN',
      editable: true,
      success: (oldRes) => {
        if (!oldRes.confirm || !String(oldRes.content || '').trim()) return
        const oldPIN = String(oldRes.content).trim()
        wx.showModal({
          title: '新 PIN',
          content: '请输入新 PIN（至少 4 位）',
          editable: true,
          success: (newRes) => {
            if (!newRes.confirm) return
            const newPIN = String(newRes.content || '').trim()
            if (newPIN.length < 4) {
              wx.showToast({ title: '新 PIN 至少 4 位', icon: 'none' })
              return
            }
            auth.changePIN(oldPIN, newPIN, base).then(() => {
              this.refreshPINStatus()
              wx.showToast({ title: '已修改，电脑网页需重新扫码', icon: 'none' })
            }).catch((e) => {
              wx.showToast({ title: e.message || '修改失败', icon: 'none' })
            })
          }
        })
      }
    })
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
