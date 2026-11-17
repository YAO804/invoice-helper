const store = require('../../utils/store')
const batch = require('../../utils/batch')
const category = require('../../utils/category')

const EMPTY = {
  invoice_no: '',
  issue_date: '',
  invoice_type: '数电票',
  total: '',
  reimburser: '',
  category: '未分类',
  note: ''
}

const BASE_FIELDS = {
  invoice_code: '',
  source: 'manual',
  confidence: 1,
  raw_qr: '',
  qr_integrity: 'n/a',
  items: [],
  files: [],
  edited_fields: []
}

function formFromRecord(rec) {
  return {
    invoice_no: rec.invoice_no || '',
    issue_date: rec.issue_date || '',
    invoice_type: rec.invoice_type || '',
    total: rec.total_cent ? store.yuan(rec.total_cent) : '',
    reimburser: rec.reimburser || '',
    category: rec.category || '未分类',
    note: rec.note || ''
  }
}

Page({
  data: {
    isEdit: false,
    id: null,
    hint: '',
    categories: category.CATEGORIES,
    form: Object.assign({}, EMPTY),
    dateText: '请选择开票日期'
  },

  onLoad(options) {
    if (options.id) return this.loadExisting(Number(options.id))
    this.startNew()
  },

  loadExisting(id) {
    const inv = store.getInvoice(id)
    if (!inv) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      return
    }
    this.origin = inv
    this.setData({
      isEdit: true,
      id: inv.id,
      dateText: inv.issue_date || '请选择开票日期',
      form: formFromRecord(inv)
    })
  },

  /** 扫码/导入生成的草稿经 globalData 传入，优先于空白表单 */
  startNew() {
    const app = getApp()
    const draft = app.globalData.draft || null
    app.globalData.draft = null
    this.draftBase = draft
    const rec = draft || Object.assign({}, EMPTY, { issue_date: formatDate(new Date()) })
    this.setData({
      form: formFromRecord(rec),
      dateText: rec.issue_date || '请选择开票日期',
      hint: draft && draft.hint ? draft.hint : ''
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const patch = {}
    patch['form.' + field] = e.detail.value
    this.setData(patch)
  },

  onCategoryChange(e) {
    this.setData({ 'form.category': category.CATEGORIES[Number(e.detail.value)] })
  },

  onDateChange(e) {
    this.setData({ 'form.issue_date': e.detail.value, dateText: e.detail.value })
  },

  onSave() {
    const f = this.data.form
    if (!f.invoice_no.trim()) {
      wx.showToast({ title: '请填发票号码', icon: 'none' })
      return
    }
    if (!f.issue_date) {
      wx.showToast({ title: '请选择开票日期', icon: 'none' })
      return
    }

    const base = this.origin || this.draftBase || BASE_FIELDS
    const record = Object.assign({}, base, {
      id: this.data.id || undefined,
      invoice_no: f.invoice_no.trim(),
      issue_date: f.issue_date,
      invoice_type: f.invoice_type || '数电票',
      total_cent: store.toCents(f.total),
      reimburser: (f.reimburser || '').trim(),
      category: f.category || '未分类',
      note: f.note.trim()
    })
    record.anomaly = store.validate(record)

    const dup = store.findDuplicate(record)
    if (dup && dup.id !== record.id) {
      // 扫码草稿遇到 XML 原件时直接补全，不弹「疑似重复」让人误以为要覆盖
      const merged = batch.mergeBetter(dup, record)
      if (merged) return this.commit(merged)
      const that = this
      wx.showModal({
        title: '疑似重复',
        content: '已有一条相同的「号码 + 日期 + 金额」记录。仍要保存吗？',
        success(res) { if (res.confirm) that.commit(record) }
      })
      return
    }
    this.commit(record)
  },

  commit(record) {
    const saved = store.upsertInvoice(record)
    wx.showToast({ title: this.data.isEdit ? '已更新' : '已保存', icon: 'none' })
    setTimeout(function () {
      wx.navigateBack({
        delta: 1,
        fail() { wx.redirectTo({ url: '/pages/list/list' }) }
      })
    }, 500)
    return saved
  },

  onCancel() {
    wx.navigateBack()
  }
})

function formatDate(d) {
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
