async function requestJSON(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || response.statusText)
  return data
}

function deleteJSON(url) {
  return requestJSON(url, { method: 'DELETE' })
}

function uploadOne(file, source, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files/upload')

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
    form.append('source', source)
    xhr.send(form)
  })
}

async function uploadFiles(files, source, onProgress) {
  const result = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const record = await uploadOne(file, source, (percent) => {
      onProgress(i + 1, files.length, file.name, percent, '上传中')
    })
    onProgress(i + 1, files.length, file.name, 100, record.duplicate ? '已存在' : '完成')
    result.push(record)
  }
  return result
}
