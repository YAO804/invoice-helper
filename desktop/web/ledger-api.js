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

function commitInvoiceImport(file) {
  return requestJSON('/api/invoices/import?confirm=1', {
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
