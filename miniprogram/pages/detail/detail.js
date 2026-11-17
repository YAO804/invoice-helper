const store = require('../../utils/store')
const labels = require('../../utils/labels')

Page({
  data: {
    inv: null,
    title: '',
    no: '',
    date: '',
    sourceText: '',
    statusText: '',
    totalText: '0.00',
    reimburser: '',
    note: '',
    anomaly: [],
    items: [],
    meta: {},
    files: [],
    rawQr: '',
    verifiedText: ''
  },

  onLoad(options) {
    this.invId = Number(options.id)
    this.load()
  },

  onShow() {
    this.load()
  },

  load() {
    const inv = store.getInvoice(this.invId)
    if (!inv) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 800)
      return
    }

    const meta = inv.meta || {}
    const sig = meta.signature || {}
    const metaRows = []
    if (meta.version) metaRows.push({ k: 'XML 版本', v: meta.version })
    if (meta.tag) metaRows.push({ k: '票种标签', v: meta.tag })
    if (meta.labels && meta.labels.eInvoiceType) metaRows.push({ k: '数电票类型', v: meta.labels.eInvoiceType.name || '-' })
    if (meta.isBlue !== null && meta.isBlue !== undefined) metaRows.push({ k: '蓝字/红字', v: meta.isBlue ? '蓝字发票' : '红字发票' })
    if (meta.drawer) metaRows.push({ k: '开票人', v: meta.drawer })
    if (amountCn(meta)) metaRows.push({ k: '大写金额', v: amountCn(meta) })
    if (sig.present) {
      metaRows.push({ k: '签名算法', v: sig.algorithmName || sig.algorithm || '-' })
      metaRows.push({ k: '签名格式', v: sig.format || '-' })
      if (sig.time) metaRows.push({ k: '签名时间', v: sig.time })
    }

    const items = (inv.items || []).map(function (it) {
      return {
        line_no: it.line_no || 1,
        name: it.name,
        totalText: store.yuan(it.total_cent)
      }
    })

    this.setData({
      inv: inv,
      title: inv.reimburser || inv.invoice_no || '未填报销人',
      no: inv.invoice_no || '无号码',
      date: inv.issue_date || '日期待补',
      sourceText: labels.sourceName(inv.source, true),
      statusText: inv.status === 'manually_verified' ? '已人工核验' : '待人工核验',
      totalText: store.yuan(inv.total_cent),
      reimburser: inv.reimburser || '（待补录）',
      note: inv.note || '',
      anomaly: inv.anomaly || [],
      items: items,
      meta: { rows: metaRows, hasSignature: !!sig.present },
      files: inv.files || [],
      rawQr: inv.raw_qr || '',
      verifiedText: inv.status === 'manually_verified' && inv.verified_at
        ? formatTime(inv.verified_at) : ''
    })
  },

  onEdit() {
    wx.navigateTo({ url: '/pages/edit/edit?id=' + this.invId })
  },

  onVerify() {
    const inv = this.data.inv
    const next = inv.status === 'manually_verified' ? 'unknown' : 'manually_verified'
    const updated = Object.assign({}, inv, { status: next, verified_at: next === 'manually_verified' ? Date.now() : null })
    store.upsertInvoice(updated)
    wx.showToast({ title: next === 'manually_verified' ? '已标记核验' : '已取消标记', icon: 'none' })
    this.load()
  },

  onDelete() {
    const that = this
    wx.showModal({
      title: '删除这条记录？',
      content: '只删台账记录，不删原件文件。删除后无法恢复。',
      confirmColor: '#b42318',
      success(res) {
        if (!res.confirm) return
        store.deleteInvoice(that.invId)
        wx.showToast({ title: '已删除', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 600)
      }
    })
  },

  onCopyNo() {
    wx.setClipboardData({ data: this.data.no })
  }
})

function amountCn(meta) {
  return meta.amount_cn || ''
}

function formatTime(ms) {
  const d = new Date(ms)
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
