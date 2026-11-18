const lanservice = require('../../utils/lanservice')
const discover = require('../../utils/discover')
const auth = require('../../utils/auth')

/** 弹输入框要 PIN；取消或位数不够都返回空串，由调用方决定怎么提示 */
function promptPIN(title, content) {
  return new Promise(function (resolve) {
    wx.showModal({
      title: title,
      content: content,
      editable: true,
      placeholderText: '例如 123456',
      success: function (res) {
        if (!res.confirm) return resolve('')
        const pin = String(res.content || '').trim()
        if (pin.length < 4) {
          wx.showToast({ title: 'PIN 至少 4 位', icon: 'none' })
          return resolve('')
        }
        resolve(pin)
      }
    })
  })
}

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

  /** 连接失败必须弹 toast：底部那行 tiny 提示太容易被忽略 */
  showConnectFailure(tip, toast) {
    this.setData({ discoverTip: tip, discovering: false, scanning: false })
    wx.showToast({ title: toast, icon: 'none' })
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
      if (e && e.message === '搜索已取消') {
        this.setData({ discoverTip: '已停止搜索', discovering: false })
        return
      }
      this.showConnectFailure(
        (e && e.message) || '没有找到电脑，请扫码连接或手动填写地址',
        '自动搜索未找到电脑'
      )
    }
  },

  onCancelDiscover() {
    discover.cancel()
    this.setData({ discovering: false, discoverTip: '已停止搜索' })
  },

  /**
   * 一个入口认两种二维码：
   * - 登录码（网页未登录时的遮罩）：连地址 + 用 PIN 授权网页登录
   * - 连接码（网页已登录后的「连接小程序」）：只连地址
   * 用户不用判断该点哪个按钮，扫哪个就办哪件事。
   */
  async onScanConnect() {
    if (this.data.scanning) return
    this.setData({ scanning: true, discoverTip: '正在扫码…' })
    try {
      const raw = await discover.scanRaw()
      const login = auth.parseLoginCode(raw)
      const base = login ? await this.loginWithCode(login) : await this.connectWithCode(raw)
      lanservice.setBase(base)
      lanservice.startAutoHeartbeat()
      this.setData({
        desktopUrl: base,
        desktopStatus: login ? '已扫码登录' : '已扫码连接',
        discoverTip: login
          ? '已连接并登录电脑网页，可切到浏览器查看'
          : '已连接电脑：' + base + '；如需登录网页，请扫电脑网页登录二维码',
        scanning: false
      })
      wx.showToast({ title: login ? '连接并登录成功' : '已连接电脑', icon: 'none' })
    } catch (e) {
      const message = (e && e.message) || '扫码失败，请手动填写地址'
      this.showConnectFailure(message, message.indexOf('401') >= 0 ? 'PIN 不正确' : '扫码失败')
    }
  },

  /** 登录码必须先有 PIN；没有就当场问一个，别让用户再去找「设置 PIN」 */
  async loginWithCode(login) {
    if (!auth.hasPIN()) {
      const pin = await promptPIN('设置 PIN', '扫码登录需要 PIN，请输入电脑端 PIN（默认 123456）')
      if (!pin) throw new Error('尚未设置 PIN，已取消扫码登录')
      auth.setPIN(pin)
      this.refreshPINStatus()
    }
    await auth.confirmLogin(login.base, login.code)
    return login.base
  },

  /** 连接码只带地址，探活通过才用 */
  async connectWithCode(raw) {
    const url = discover.parseConnectCode(raw)
    if (!url) throw new Error('这不是攒票小匣的二维码')
    const ok = await discover.verifyUrl(url)
    if (!ok) throw new Error('扫到地址了但电脑没响应，确认在同一个 WiFi')
    return url
  },

  /** 首次设置 PIN：存在本机，之后所有请求自动带，无感登录 */
  async onSetupPIN() {
    const pin = await promptPIN('设置 PIN', '请输入 4 位以上数字，用于连接电脑端')
    if (!pin) return
    auth.setPIN(pin)
    this.refreshPINStatus()
    wx.showToast({ title: 'PIN 已保存', icon: 'none' })
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
