package ledger

import "strings"

// ManualBatch 是网页手动录入的固定批次名。
// 扫码和导入各有一批自动批次号，手动录入单独归一类，台账里一眼能看出哪条是自己敲进去的。
const ManualBatch = "手动录入"

// Create 追加一条发票。
// 与 AddInvoices 的区别：不参与自动批次编号，批次固定「手动录入」，
// 并直接把重复标记算好返回，网页保存后能立刻看到结果。
func (s *Store) Create(invoice Invoice) (Invoice, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	list, err := s.load()
	if err != nil {
		return Invoice{}, err
	}

	invoice.Batch = fallback(invoice.Batch, ManualBatch)
	invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())
	invoice.NeedFill = strings.TrimSpace(invoice.Reimburser) == ""

	key := identityKey(invoice)
	for _, existing := range list {
		if identityKey(existing) == key {
			invoice.Duplicate = true
			break
		}
	}

	list = append(list, invoice)
	if err := s.save(list); err != nil {
		return Invoice{}, err
	}
	invoice.ID = len(list)
	return invoice, nil
}
