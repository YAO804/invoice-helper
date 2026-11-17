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

function downloadInvoiceCSV(params) {
  window.location.href = '/api/invoices/export?' + params.toString()
}
