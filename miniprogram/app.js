const lanservice = require('./utils/lanservice')

App({
  globalData: {
    // M0 验证页的旧字段，保留以免翻记录时找不到
    m0Results: {}
  },

  onLaunch() {
    // 台账不落本机，启动只负责连电脑：地址记得就起心跳，没地址就搜一次
    lanservice.startAutoHeartbeat()
    if (lanservice.shouldAutoConnect()) {
      lanservice.autoConnect().catch(function () {})
    }
  },

  onShow() {
    lanservice.startAutoHeartbeat()
  },

  onError(err) {
    console.error('app error', err)
  }
})
