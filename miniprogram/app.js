const store = require('./utils/store')
const lanservice = require('./utils/lanservice')

App({
  globalData: {
    // 扫码/导入生成的待确认草稿，由编辑页消费后清空
    draft: null,
    // M0 验证页的旧字段，保留以免翻记录时找不到
    m0Results: {}
  },

  onLaunch() {
    try {
      store.init()
    } catch (e) {
      console.error('[store] init failed', e)
    }
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
