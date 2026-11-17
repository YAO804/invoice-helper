package ledger

func (s *Store) PurgeByCreatedAt(from, to string, dryRun bool) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	list, err := s.load()
	if err != nil {
		return 0, err
	}

	kept := make([]Invoice, 0, len(list))
	removed := 0
	for _, invoice := range list {
		if inCreatedRange(invoice.CreatedAt, from, to) {
			removed++
			continue
		}
		kept = append(kept, invoice)
	}
	if removed == 0 || dryRun {
		return removed, nil
	}
	return removed, s.save(kept)
}

func inCreatedRange(created, from, to string) bool {
	day := created
	if len(day) >= 10 {
		day = day[:10]
	}
	if from != "" && day < from {
		return false
	}
	if to != "" && day > to {
		return false
	}
	return true
}
