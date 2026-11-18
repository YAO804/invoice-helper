/**
 * 传输页三个列表的「删除 / 清理」语义。
 *
 * 三个列表删的东西根本不同：本机发送记录、电脑已收（incoming）、电脑待取（outgoing）。
 * 文案和调用分头写很容易串（删了本机记录却提示"电脑端也删了"），所以集中在这里，
 * 页面只负责问「当前是哪个列表」。
 */

const lanservice = require('./lanservice')
const filesend = require('./filesend')
const filetake = require('./filetake')

const RETENTION_DAYS = filesend.RETENTION_DAYS

/** 页面方向 + 分段 → 数据来源：local / incoming / offer */
function scopeOf(direction, tab) {
  if (direction === 'from') return 'offer'
  return tab === 'sent' ? 'local' : 'incoming'
}

/** 计数单位：本机是"条记录"，电脑上的是"个文件" */
function unit(scope) {
  return scope === 'local' ? '条记录' : '个文件'
}

/** 清理超期时这类文件叫什么 */
function purgeName(scope) {
  return scope === 'offer' ? '待取文件' : '接收文件'
}

function removeText(scope, count) {
  if (scope === 'local') {
    return '将删除本机 ' + count + ' 条发送记录。只影响记录，电脑端已收到的文件不会删除。'
  }
  if (scope === 'offer') {
    return '将删除电脑端 ' + count + ' 个待取文件。删除后不可恢复，电脑上的源文件不受影响。'
  }
  return '将删除电脑端 ' + count + ' 个已收文件。删除后不可恢复，手机里的台账记录不受影响。'
}

function removeAllText(scope, count) {
  if (scope === 'local') {
    return '将清空本机 ' + count + ' 条发送记录。电脑端已收到的文件不受影响。'
  }
  if (scope === 'offer') {
    return '将删除电脑端全部 ' + count + ' 个待取文件。删除后不可恢复。'
  }
  return '将删除电脑端全部 ' + count + ' 个已收文件。删除后不可恢复。'
}

/** 批量删除，统一返回 { deleted } */
function remove(scope, ids) {
  if (scope === 'local') return Promise.resolve({ deleted: filesend.removeHistory(ids) })
  if (scope === 'offer') return filetake.remove(ids)
  return lanservice.deleteIncoming(ids)
}

/** 清空当前列表，统一返回 { deleted } */
function removeAll(scope) {
  if (scope === 'local') {
    const count = filesend.displayHistory().length
    filesend.clearHistory()
    return Promise.resolve({ deleted: count })
  }
  if (scope === 'offer') return filetake.remove([])
  return lanservice.deleteIncoming([])
}

/** 按保留期清理：confirm=false 只预览数量 */
function purge(scope, days, confirm) {
  if (scope === 'offer') return filetake.purge(days, confirm)
  return lanservice.purgeIncoming(days, confirm)
}

module.exports = {
  RETENTION_DAYS: RETENTION_DAYS,
  scopeOf: scopeOf,
  unit: unit,
  purgeName: purgeName,
  removeText: removeText,
  removeAllText: removeAllText,
  remove: remove,
  removeAll: removeAll,
  purge: purge
}
