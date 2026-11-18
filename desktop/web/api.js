async function requestJSON(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || response.statusText)
  return data
}

function deleteJSON(url) {
  return requestJSON(url, { method: 'DELETE' })
}

function sendJSON(url, method, body) {
  return requestJSON(url, {
    method: method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  })
}

/**
 * 带进度的单文件上传。url 决定文件去向，两个方向共用：
 *   /api/files/upload   → 接收区（小程序传上来的）
 *   /api/files/outgoing → 待取区（等小程序来取的）
 */
function postFile(url, file, fields, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || '{}')
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data)
      } else {
        reject(new Error(data.error || '上传失败'))
      }
    }
    xhr.onerror = () => reject(new Error('网络中断'))

    const form = new FormData()
    form.append('file', file)
    Object.keys(fields || {}).forEach((key) => form.append(key, fields[key]))
    xhr.send(form)
  })
}

/** 顺序上传一批，逐个回报：onProgress(index, name, percent, state)，index 从 1 开始 */
async function postFiles(url, files, fields, onProgress) {
  const result = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const record = await postFile(url, file, fields, (percent) => {
      onProgress(i + 1, file.name, percent, '上传中')
    })
    onProgress(i + 1, file.name, 100, record.duplicate ? '已存在' : '完成')
    result.push(record)
  }
  return result
}
