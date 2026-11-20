/**
 * 页面内提示框，替换浏览器原生 alert。
 *
 * 原生 alert 带着「localhost:8765 显示」这种浏览器标题，跟页面完全不是一套样式。
 * 这里在脚本加载时把 window.alert 换掉，各调用点（含 app.js / preview.js）一行都不用改，
 * 也因此统一走同一个出口。测试用 vm 单独加载业务脚本时不引这个文件，mock 的 alert 仍生效。
 */

function showAlert(message) {
  const text = String(message == null ? '' : message)
  $('alertMessage').textContent = text
  $('alertModal').hidden = false
  const button = $('alertOkBtn')
  if (button && button.focus) button.focus()
}

function closeAlert() {
  $('alertModal').hidden = true
}

/** 加载即接管：所有 alert(...) 调用都进页面内提示框 */
window.alert = showAlert

// 只认「知道了」按钮关闭：点遮罩、按 Esc 都不关，跟其它弹窗一致
const alertOk = document.getElementById('alertOkBtn')
if (alertOk) alertOk.addEventListener('click', closeAlert)
