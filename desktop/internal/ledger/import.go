package ledger

type ImportItem struct {
	Invoice Invoice `json:"invoice"`
	Status  string  `json:"status"`
	Message string  `json:"message"`
}

type ImportPreview struct {
	Total          int          `json:"total"`
	NewCount       int          `json:"new_count"`
	DuplicateCount int          `json:"duplicate_count"`
	InvalidCount   int          `json:"invalid_count"`
	Items          []ImportItem `json:"items"`
}

func (s *Store) PreviewImport(content []byte) (ImportPreview, error) {
	incoming, err := parseCSV(content)
	if err != nil {
		return ImportPreview{}, err
	}

	existing, err := s.load()
	if err != nil {
		return ImportPreview{}, err
	}

	numbers := numberSet(existing)
	batch := newBatch()
	preview := ImportPreview{Total: len(incoming), Items: []ImportItem{}}

	for _, invoice := range incoming {
		invoice.Batch = fallback(invoice.Batch, batch)
		invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())

		item := ImportItem{Invoice: invoice}
		switch {
		case invoice.Number == "":
			item.Status = "invalid"
			item.Message = "缺少发票号码"
			preview.InvalidCount++
		case numbers[invoice.Number]:
			item.Status = "duplicate"
			item.Message = "发票号码已存在"
			preview.DuplicateCount++
		default:
			item.Status = "new"
			preview.NewCount++
			numbers[invoice.Number] = true
		}
		preview.Items = append(preview.Items, item)
	}
	return preview, nil
}

func (s *Store) CommitImport(content []byte) (int, error) {
	incoming, err := parseCSV(content)
	if err != nil {
		return 0, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	existing, err := s.load()
	if err != nil {
		return 0, err
	}

	numbers := numberSet(existing)
	batch := newBatch()
	added := 0

	for _, invoice := range incoming {
		invoice.Batch = fallback(invoice.Batch, batch)
		invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())
		if invoice.Number == "" {
			continue
		}
		numbers[invoice.Number] = true
		existing = append(existing, invoice)
		added++
	}
	if added == 0 {
		return 0, nil
	}
	return added, s.save(existing)
}

func numberSet(list []Invoice) map[string]bool {
	result := map[string]bool{}
	for _, invoice := range list {
		if invoice.Number != "" {
			result[invoice.Number] = true
		}
	}
	return result
}
