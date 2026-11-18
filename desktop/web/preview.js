/**
 * 文件预览弹层：PDF 交给浏览器内置阅读器，图片直接显示，文本抓下来放进 pre。
 *
 * 能不能预览由后端给（`/api/files` 的 `preview` 字段），前端不再维护一份扩展名白名单：
 * 两份白名单迟早会漂，而这里一旦判断错就是「点了没反应」或「用错方式打开」。
 */

const PREVIEW_TEXT_LIMIT = 512 * 1024

function previewURL(item) {
  return '/api/incoming/' + encodeURIComponent(item.id) + '/view'
}

function downloadURL(item) {
  return '/api/incoming/' + encodeURIComponent(item.id) + '/download'
}

/**
 * 文本预览：抓下来转义后塞进 pre。
 * 超过上限不让预览——几百 KB 的发票 XML 铺进 DOM 会把页面卡死几秒。
 */
async function renderTextPreview(item) {
  const box = $('previewBody')
  if (item.size > PREVIEW_TEXT_LIMIT) {
    box.innerHTML = '<p class="preview-note">文件有 ' + human(item.size) +
      '，在浏览器里渲染会很慢，请下载后查看。</p>'
    return '内容较大，未加载'
  }

  box.innerHTML = '<p class="preview-note">读取中…</p>'
  try {
    const response = await fetch(previewURL(item))
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const text = await response.text()
    box.innerHTML = '<pre class="preview-text">' + esc(text) + '</pre>'
    return '按纯文本显示，最多加载 ' + human(PREVIEW_TEXT_LIMIT)
  } catch (error) {
    box.innerHTML = '<p class="preview-note">读取失败：' + esc(error.message) + '</p>'
    return ''
  }
}

async function openPreview(id) {
  const list = (filesData && filesData.incoming) || []
  const item = list.find((row) => row.id === id)
  if (!item) return

  if (!item.preview) {
    alert('「' + item.name + '」这种格式浏览器打不开（OFD / ZIP / Office 等），请下载后用本机软件查看。')
    return
  }

  $('previewTitle').textContent = item.name
  $('previewDownload').href = downloadURL(item)
  $('previewDownload').setAttribute('download', item.name)
  $('previewModal').hidden = false

  let hint = ''
  if (item.preview === 'text') {
    hint = await renderTextPreview(item)
  } else if (item.preview === 'image') {
    $('previewBody').innerHTML = '<img class="preview-image" src="' + previewURL(item) +
      '" alt="' + esc(item.name) + '">'
    hint = '图片直接显示，右键可另存'
  } else {
    $('previewBody').innerHTML = '<iframe class="preview-frame" src="' + previewURL(item) +
      '" title="' + esc(item.name) + '"></iframe>'
    hint = '用浏览器内置阅读器打开，也可以点右上角「下载」'
  }
  $('previewHint').textContent = hint
}

function closePreview() {
  $('previewModal').hidden = true
  // 必须清空：留着 iframe 等于一直占着 PDF 渲染进程
  $('previewBody').innerHTML = ''
  $('previewHint').textContent = ''
}

function bindPreview() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preview-id]')
    if (!button) return
    openPreview(button.dataset.previewId)
  })

  $('closePreviewBtn').addEventListener('click', closePreview)
  $('previewModal').addEventListener('click', (event) => {
    if (event.target === $('previewModal')) closePreview()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('previewModal').hidden) closePreview()
  })
}

bindPreview()
