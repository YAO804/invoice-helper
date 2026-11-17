package ledger

func (s *Store) AddInvoices(list []Invoice) (int, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, err := s.load()
	if err != nil {
		return 0, "", err
	}

	batch := newBatch()
	added := 0
	for _, invoice := range list {
		if invoice.Number == "" {
			continue
		}
		invoice.Batch = fallback(invoice.Batch, batch)
		invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())
		existing = append(existing, invoice)
		added++
	}
	if added == 0 {
		return 0, batch, nil
	}
	return added, batch, s.save(existing)
}
