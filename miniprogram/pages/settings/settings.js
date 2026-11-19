const lanservice = require('../../utils/lanservice')
const discover = require('../../utils/discover')
const auth = require('../../utils/auth')
const ledger = require('../../utils/ledger')
const hint = require('../../utils/connect-hint')

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

/** 用户自己取消（扫码按返回、停止搜索）不算失败，静默复位即可 */
function isCancelled(error) {
  return !!(error && (error.cancelled || error.message === '搜索已取消'))
}

Page({
  data: {
    desktopUrl: '',
    status: 'none',
    statusTone: 'warn',
    statusTitle: '未连接电脑',
    statusHost: '',
    statusMeta: '',
    primaryLabel: '扫码连接电脑',
    hasBase: false,
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
    this.setData({ canDiscover: discover.supported(), desktopUrl: url })
    this.refreshStatus()
  },

  /**
   * 状态只能由真实请求改写。以前这里写的是「状态：已配置」——那只是说
   * 存过地址，电脑关机、换了 WiFi 照样显示已配置，用户看着这行字根本
   * 判断不出能不能收票。
   */
  refreshStatus() {
    const base = lanservice.getBase()
    if (!base) {
      this.applyStatus('none')
      return Promise.resolve(false)
    }
    this.applyStatus('checking')
    const that = this
    return lanservice.probe().then(function (ok) {
      that.applyStatus(ok ? 'ok' : 'fail')
      return ok
    })
  },

  /** 张数与同步时间取自台账内存镜像：别的页面同步过就顺手显示，不必再拉一次 */
  applyStatus(status) {
    const base = lanservice.getBase()
    const snap = status === 'ok' ? ledger.snapshot() : { total: 0, syncedAt: 0 }
    const view = hint.cardView(status, {
      base: base,
      count: snap.total,
      syncedAt: snap.syncedAt,
      now: Date.now()
    })
    this.setData({
      status: status,
      statusTone: view.tone,
      statusTitle: view.title,
      statusHost: view.host,
      statusMeta: view.meta,
      primaryLabel: view.primary,
      hasBase: !!base
    })
  },

  /** 状态卡上那个主按钮：没连上就是去连，连上或连不上就是重新探一次 */
  onPrimary() {
    if (this.data.status === 'checking') return
    if (this.data.status === 'none') return this.onScanConnect()
    this.onRetry()
  },

  /** 断开只清本机记的地址，电脑端数据一概不动 */
  onDisconnect() {
    const that = this
    wx.showModal({
      title: '断开这台电脑？',
      content: '只清掉本机记的地址，电脑端的发票和文件都不受影响。要恢复收票得重新扫码或搜索。',
      confirmText: '断开',
      success(res) {
        if (!res.confirm) return
        lanservice.setBase('')
        that.setData({ desktopUrl: '', discoverTip: '已断开电脑' })
        that.applyStatus('none')
        wx.showToast({ title: '已断开', icon: 'none' })
      }
    })
  },

  onRetry() {
    if (this.data.status === 'checking') return
    this.refreshStatus().then(function (ok) {
      if (ok) wx.showToast({ title: '电脑有响应', icon: 'none' })
    })
  },

  refreshPINStatus() {
    const set = auth.hasPIN()
    this.setData({ pinSet: set, pinMask: set ? '已设置（******）' : '未设置' })
  },

  /**
   * 连接失败统一出口：状态卡留一行结论，模态框讲清「为什么」和「下一步」。
   * 不用 toast——一行装不下原因，而原因恰恰是用户唯一需要的东西。
   */
  showConnectFailure(message) {
    const tip = hint.failureTip(message)
    this.setData({ discoverTip: tip.title, discovering: false, scanning: false })
    wx.showModal({
      title: tip.title,
      content: tip.content,
      showCancel: false,
      confirmText: '知道了'
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
      this.applyStatus('none')
      wx.showToast({ title: '请先填写地址', icon: 'none' })
      return
    }
    lanservice.startAutoHeartbeat()
    // 换了地址，上一条「已找到电脑：旧地址」就成了矛盾信息，一起清掉
    this.setData({ desktopUrl: url, discoverTip: '' })
    wx.showToast({ title: '已保存', icon: 'none' })
    // 保存只是把地址写到本机，能不能用还得探一下，别让状态停在「已配置」
    this.refreshStatus()
  },

  async onDiscover() {
    if (this.data.discovering) return
    this.setData({ discovering: true, discoverTip: '正在搜索同一局域网的电脑…' })
    try {
      const url = await lanservice.autoConnect({ settleMs: 2500 })
      this.setData({
        desktopUrl: url,
        discoverTip: '已找到电脑：' + url,
        discovering: false
      })
      this.applyStatus('ok')
      wx.showToast({ title: '已自动连接', icon: 'none' })
    } catch (e) {
      if (isCancelled(e)) {
        this.setData({ discoverTip: '已停止搜索', discovering: false })
        return
      }
      this.showConnectFailure(e && e.message)
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
        discoverTip: login
          ? '已连接并登录电脑网页，可切到浏览器查看'
          : '已连接电脑：' + base + '；如需登录网页，请扫电脑网页登录二维码',
        scanning: false
      })
      this.applyStatus('ok')
      wx.showToast({ title: login ? '连接并登录成功' : '已连接电脑', icon: 'none' })
    } catch (e) {
      if (isCancelled(e)) {
        this.setData({ discoverTip: (e && e.message) || '已取消扫码', scanning: false })
        return
      }
      this.showConnectFailure(e && e.message)
    }
  },

  /** 登录码必须先有 PIN；没有就当场问一个，别让用户再去找「设置 PIN」 */
  async loginWithCode(login) {
    if (!auth.hasPIN()) {
      const pin = await promptPIN('设置 PIN', '扫码登录需要 PIN，请输入电脑端 PIN（默认 123456）')
      if (!pin) {
        const cancelled = new Error('已取消扫码登录')
        cancelled.cancelled = true
        throw cancelled
      }
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

  /** 测的是「电脑通不通」，用不带 PIN 的探活；PIN 错属于另一件事，别混成连不上 */
  async onTestDesktop() {
    const url = lanservice.setBase(this.data.desktopUrl)
    if (!url) {
      wx.showToast({ title: '请先填写地址', icon: 'none' })
      return
    }
    this.setData({ desktopUrl: url })
    const ok = await lanservice.probe()
    this.applyStatus(ok ? 'ok' : 'fail')
    if (ok) {
      this.setData({ discoverTip: '已连通 ' + hint.hostText(url) })
      wx.showToast({ title: '连接成功', icon: 'none' })
      return
    }
    this.showConnectFailure('连不上 ' + hint.hostText(url))
  },

  onExport() {
    wx.navigateTo({ url: '/pages/export/export' })
  },

  onM0() {
    wx.navigateTo({ url: '/pages/index/index' })
  }
})
