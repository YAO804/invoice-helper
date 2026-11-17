package ledger

func (s *Store) Delete(ids []int) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	all, err := s.load()
	if err != nil {
		return 0, err
	}

	wanted := map[int]bool{}
	for _, id := range ids {
		wanted[id] = true
	}

	kept := []Invoice{}
	deleted := 0
	for _, invoice := range all {
		if wanted[invoice.ID] {
			deleted++
			continue
		}
		kept = append(kept, invoice)
	}
	if deleted == 0 {
		return 0, nil
	}
	return deleted, s.save(kept)
}
