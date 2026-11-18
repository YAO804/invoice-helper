package ledger

// Export 按查询条件导出 CSV。
//
// 必须和 List 走同一套标记：只 markNeedFill 而不 markDuplicates 的话，
// only_duplicates 过滤会把所有行都判为「不重复」，导出一张空表。
func (s *Store) Export(query Query) ([]byte, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}

	all = markDuplicates(all, duplicateGroups(all))
	all = markNeedFill(all)
	if query.Sort != "" {
		all = sortInvoices(all, query.Sort)
	}
	return writeCSV(filter(all, query))
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
