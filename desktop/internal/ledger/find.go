package ledger

// FindByKeys 按「代码+号码」查重，返回值以发票号码为键，方便客户端按号码回填。
//
// 客户端只给了号码（没有代码）时退化为按号码匹配：可能是手输草稿，也可能是
// 数电票——数电票本来就没有代码。查重只用于发送前提示，宁可多提示一次，
// 也不要把真重复放过去。
func (s *Store) FindByKeys(keys []InvoiceKey) (map[string]Invoice, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}

	byKey := map[string]Invoice{}
	byNumber := map[string]Invoice{}
	for _, invoice := range all {
		if invoice.Number == "" {
			continue
		}
		if _, exists := byKey[identityKey(invoice)]; !exists {
			byKey[identityKey(invoice)] = invoice
		}
		if _, exists := byNumber[invoice.Number]; !exists {
			byNumber[invoice.Number] = invoice
		}
	}

	result := map[string]Invoice{}
	for _, key := range keys {
		if key.Number == "" {
			continue
		}
		if _, exists := result[key.Number]; exists {
			continue
		}
		if key.Code != "" {
			if invoice, ok := byKey[identityKey(Invoice{Code: key.Code, Number: key.Number})]; ok {
				result[key.Number] = invoice
			}
			continue
		}
		if invoice, ok := byNumber[key.Number]; ok {
			result[key.Number] = invoice
		}
	}
	return result, nil
}
