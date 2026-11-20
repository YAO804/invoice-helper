/**
 * 网页手动新增发票的字段校验。
 *
 * 只作用于新增：补录老票时号码以外的字段可能本来就空（need_fill 的来源），
 * 强行要求填全就没法逐步补录了。金额虽然存的是字符串，但必须是数字写法，
 * 否则金额筛选和合计都是错的。
 */

/** 报销人不用填：由报销人自己补录，其余字段新增时必须齐全 */
const REQUIRED_NEW_FIELDS = [
  ['number', '发票号码'], ['code', '发票代码'], ['kind', '票种'],
  ['issue_date', '开票日期'], ['total', '价税合计']
]

/** 允许整数、小数和负号（红冲票），不接受千分位、科学计数法、文字 */
const NUMERIC_TOTAL = /^-?\d+(\.\d+)?$/

function isNumericTotal(value) {
  return NUMERIC_TOTAL.test(String(value || '').trim())
}

/** 返回所有不合规的中文提示；空数组表示可以保存 */
function validateNewInvoice(values) {
  const problems = []
  REQUIRED_NEW_FIELDS.forEach(([field, label]) => {
    if (!String(values[field] || '').trim()) problems.push('请填写' + label)
  })
  if (String(values.total || '').trim() && !isNumericTotal(values.total)) {
    problems.push('价税合计必须填数字，例如 176.99')
  }
  return problems
}
