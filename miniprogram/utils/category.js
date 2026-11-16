/**
 * 消费场景自动分类：规则表，纯字符串判断。
 * 只做预填，用户随时可在录入页改；不猜就是「未分类」。
 */

const CATEGORIES = ['未分类', '餐饮', '交通', '住宿', '办公', '其他']

const RULES = [
  { name: '交通', words: ['滴滴', '出行', '打车', '网约车', '出租', '客运', '加油', '停车', '铁路', '航空', '行程单', '机票', '火车', '高铁', '地铁', '过路费', '通行费'] },
  { name: '住宿', words: ['住宿', '酒店', '宾馆', '旅馆', '房费'] },
  { name: '餐饮', words: ['餐饮', '餐费', '饭店', '食品', '外卖', '咖啡', '美食', '茶'] },
  { name: '办公', words: ['办公', '文具', '电脑', '软件', '打印', '耗材', '电信', '通信', '宽带', '服务费'] }
]

function textOf(name, items, seller) {
  const parts = [name || '', seller || '']
  ;(items || []).forEach(function (it) {
    if (typeof it === 'string') parts.push(it)
    else parts.push(it.name || '')
  })
  return parts.join(' ').toLowerCase()
}

function guess(name, items, seller) {
  const text = textOf(name, items, seller)
  for (let i = 0; i < RULES.length; i++) {
    const rule = RULES[i]
    for (let j = 0; j < rule.words.length; j++) {
      if (text.indexOf(rule.words[j]) >= 0) return rule.name
    }
  }
  return '未分类'
}

module.exports = {
  CATEGORIES: CATEGORIES,
  guess: guess
}
