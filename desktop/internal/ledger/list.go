package ledger

func (s *Store) List(query Query) ([]Invoice, []DuplicateGroup, error) {
	items, groups, _, err := s.ListWithMeta(query)
	return items, groups, err
}

// ListWithMeta 除了筛选结果，额外给出整表的最新批次号。
//
// 「最新批次」必须是**全表**的：卡片上这个值现在同时是筛选入口，
// 如果从筛选结果里取第一行，一点筛选它就跟着变，用户没法用它来筛。
func (s *Store) ListWithMeta(query Query) ([]Invoice, []DuplicateGroup, string, error) {
	all, err := s.All()
	if err != nil {
		return nil, nil, "", err
	}

	groups := duplicateGroups(all)
	latest := LatestBatch(all)

	all = markDuplicates(all, groups)
	all = markNeedFill(all)
	all = sortInvoices(all, query.Sort)
	return filter(all, query), groups, latest, nil
}

// LatestBatch 取批次号最大的那条。
// 批次号形如 B20261118-093729-174：前缀固定、时间定长，字典序最大即最新。
func LatestBatch(list []Invoice) string {
	latest := ""
	for _, invoice := range list {
		if invoice.Batch > latest {
			latest = invoice.Batch
		}
	}
	return latest
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
