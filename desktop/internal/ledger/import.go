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

	seen := identitySet(existing)
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
		case seen[identityKey(invoice)]:
			item.Status = "duplicate"
			item.Message = duplicateMessage(invoice)
			preview.DuplicateCount++
		default:
			item.Status = "new"
			preview.NewCount++
			seen[identityKey(invoice)] = true
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

	seen := identitySet(existing)
	batch := newBatch()
	added := 0

	for _, invoice := range incoming {
		invoice.Batch = fallback(invoice.Batch, batch)
		invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())
		if invoice.Number == "" {
			continue
		}
		seen[identityKey(invoice)] = true
		existing = append(existing, invoice)
		added++
	}
	if added == 0 {
		return 0, nil
	}
	return added, s.save(existing)
}

// identitySet 用「代码+号码」标记已存在的发票，与 duplicateGroups 保持同一口径。
func identitySet(list []Invoice) map[string]bool {
	result := map[string]bool{}
	for _, invoice := range list {
		if invoice.Number != "" {
			result[identityKey(invoice)] = true
		}
	}
	return result
}

// duplicateMessage 说清楚是「号码撞了」还是「代码+号码都撞了」，方便用户判断。
func duplicateMessage(invoice Invoice) string {
	if invoice.Code == "" {
		return "发票号码已存在"
	}
	return "发票代码与号码都已存在"
}
