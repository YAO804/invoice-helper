package ledger

func (s *Store) Export(query Query) ([]byte, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}
	return writeCSV(filter(markNeedFill(all), query))
}

func (s *Store) ExportIDs(ids []int) ([]byte, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}

	wanted := map[int]bool{}
	for _, id := range ids {
		wanted[id] = true
	}

	result := []Invoice{}
	for _, invoice := range all {
		if wanted[invoice.ID] {
			result = append(result, invoice)
		}
	}
	return writeCSV(result)
}
