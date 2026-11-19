function invoiceForm(file) {
  const form = new FormData()
  form.append('file', file)
  return form
}

function fetchInvoices(params) {
  return requestJSON('/api/invoices?' + params.toString())
}

function previewInvoiceImport(file) {
  return requestJSON('/api/invoices/import', {
    method: 'POST',
    body: invoiceForm(file)
  })
}

// skipDuplicates=false 是用户明确选择「全量导入」时才发的口径
function commitInvoiceImport(file, skipDuplicates) {
  const skip = skipDuplicates ? '1' : '0'
  return requestJSON('/api/invoices/import?confirm=1&skip_duplicates=' + skip, {
    method: 'POST',
    body: invoiceForm(file)
  })
}

function deleteInvoices(ids) {
  return requestJSON('/api/invoices', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  })
}

function updateInvoice(id, data) {
  return requestJSON('/api/invoices/' + id, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  })
}

function createInvoice(data) {
  return requestJSON('/api/invoices/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data)
  })
}

function purgeInvoices(from, to, confirm) {
  return requestJSON('/api/invoices/purge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from: from, to: to, confirm: confirm })
  })
}

function downloadInvoiceCSV(params) {
  window.location.href = '/api/invoices/export?' + params.toString()
}
