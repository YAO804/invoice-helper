package ledger

func (s *Store) FindByNumbers(numbers []string) (map[string]Invoice, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}

	wanted := map[string]bool{}
	for _, number := range numbers {
		if number != "" {
			wanted[number] = true
		}
	}

	result := map[string]Invoice{}
	for _, invoice := range all {
		if wanted[invoice.Number] {
			if _, exists := result[invoice.Number]; !exists {
				result[invoice.Number] = invoice
			}
		}
	}
	return result, nil
}
