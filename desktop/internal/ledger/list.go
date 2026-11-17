package ledger

func (s *Store) List(query Query) ([]Invoice, []DuplicateGroup, error) {
	all, err := s.All()
	if err != nil {
		return nil, nil, err
	}

	groups := duplicateGroups(all)
	all = markDuplicates(all, groups)
	all = markNeedFill(all)
	return filter(all, query), groups, nil
}

func CountNeedFill(list []Invoice) int {
	count := 0
	for _, invoice := range list {
		if invoice.NeedFill {
			count++
		}
	}
	return count
}
