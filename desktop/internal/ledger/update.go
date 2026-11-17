package ledger

func (s *Store) Update(id int, input Invoice) (Invoice, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	list, err := s.load()
	if err != nil {
		return Invoice{}, false, err
	}
	if id < 1 || id > len(list) {
		return Invoice{}, false, nil
	}

	input.ID = id
	input.Batch = list[id-1].Batch
	input.CreatedAt = list[id-1].CreatedAt
	list[id-1] = input

	if err := s.save(list); err != nil {
		return Invoice{}, false, err
	}
	return input, true, nil
}
