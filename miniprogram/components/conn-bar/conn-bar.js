/**
 * 顶部连接状态条：四个 tab 页共用。
 *
 * 为什么做成组件而不是每页抄一段：连接状态的含义只能有一处定义，
 * 否则四个页面迟早会给出四种说法（第一版就是收票页一套、传输页一套）。
 *
 * 状态、颜色、文案全部来自 utils/connect-hint 的 barView，
 * 组件只负责渲染、定时刷新「几分钟前」、以及点击跳设置。
 */

const hint = require('../../utils/connect-hint')

Component({
  properties: {
    status: { type: String, value: 'none', observer: 'refresh' },
    count: { type: Number, value: 0, observer: 'refresh' },
    syncedAt: { type: Number, value: 0, observer: 'refresh' },
    base: { type: String, value: '', observer: 'refresh' }
  },

  data: {
    tone: 'warn',
    badge: '未连接电脑',
    detail: '扫码收票前要先连上',
    action: '去连接'
  },

  lifetimes: {
    attached() {
      this.refresh()
      // 「3 分钟前」会自己变旧，每 30 秒重算一次；只有已连接时才需要
      this.timer = setInterval(() => {
        if (this.data.status === 'ok') this.refresh()
      }, 30000)
    },
    detached() {
      clearInterval(this.timer)
    }
  },

  methods: {
    refresh() {
      this.setData(hint.barView(this.data.status, {
        count: this.data.count,
        syncedAt: this.data.syncedAt,
        base: this.data.base,
        now: Date.now()
      }))
    },

    // 整条可点：状态条上写了「去连接 / 去设置」，点哪儿都该到位
    onTap() {
      if (this.data.status === 'ok' || this.data.status === 'checking') return
      wx.switchTab({ url: '/pages/settings/settings' })
    }
  }
})
