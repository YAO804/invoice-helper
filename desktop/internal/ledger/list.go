package ledger

func (s *Store) List(query Query) ([]Invoice, []DuplicateGroup, error) {
	items, groups, _, err := s.ListWithMeta(query)
	return items, groups, err
}

// ListMeta 是「全表」口径的汇总信息，不受筛选条件影响。
type ListMeta struct {
	// LatestBatch 是最近一次导入/发送的批次号；没有系统批次时退回最新那条的批次文本。
	LatestBatch string
	// LatestCreatedAt 是整表最新的录入时间（"2026-11-18 09:10:18"），卡片按它做「最近录入」。
	LatestCreatedAt string
}

// ListResult 是一次列表查询的全部结果。
//
// 除了筛选后的行，还要带出**全表**：统计卡片、补录建议池都要按整份台账算，
// 分页之后前端手里只有一页，这些数只能由后端给。
type ListResult struct {
	Items  []Invoice
	Groups []DuplicateGroup
	Meta   ListMeta
	All    []Invoice
}

// ListWithMeta 除了筛选结果，额外给出整表的汇总信息。
//
// 这里的值必须是**全表**的：卡片上的数字和日期同时是筛选入口，
// 如果从筛选结果里取第一行，一点筛选它就跟着变，用户没法用它来筛。
func (s *Store) ListWithMeta(query Query) ([]Invoice, []DuplicateGroup, ListMeta, error) {
	result, err := s.ListFull(query)
	if err != nil {
		return nil, nil, ListMeta{}, err
	}
	return result.Items, result.Groups, result.Meta, nil
}

// ListFull 多带回一份全表快照，供需要按全量统计的调用方（分页后的建议池）使用。
func (s *Store) ListFull(query Query) (ListResult, error) {
	all, err := s.All()
	if err != nil {
		return ListResult{}, err
	}

	groups := duplicateGroups(all)
	meta := ListMeta{LatestBatch: LatestBatch(all), LatestCreatedAt: LatestCreatedAt(all)}

	all = markDuplicates(all, groups)
	all = markNeedFill(all)
	all = sortInvoices(all, query.Sort)
	return ListResult{Items: filter(all, query), Groups: groups, Meta: meta, All: all}, nil
}

// LatestBatch 返回「最近一次导入/发送」的批次号。
//
// 不能直接取批次号字典序最大：手动录入的记录批次写的是「手动录入」这种文字标签，
// 中文码位高于 ASCII，会永远压过真正的批次号（B20261118-...），
// 卡片上就会显示「手动录入」而不是最新批次。
// 所以优先在系统生成的批次号里取最大，一个都没有时才退回「录入时间最新的那条」。
func LatestBatch(list []Invoice) string {
	latestID := ""
	for _, invoice := range list {
		if isBatchID(invoice.Batch) && invoice.Batch > latestID {
			latestID = invoice.Batch
		}
	}
	if latestID != "" {
		return latestID
	}

	newest, found := Invoice{}, false
	for _, invoice := range list {
		if !found || invoice.CreatedAt > newest.CreatedAt {
			newest, found = invoice, true
		}
	}
	return newest.Batch
}

// isBatchID 判断是不是系统生成的批次号（B + 日期-时间-毫秒）。
// 全是数字和连字符、以 B 开头、至少带日期段，避免把 "B1" 这种手写的当成批次号。
func isBatchID(value string) bool {
	if len(value) < 10 || value[0] != 'B' {
		return false
	}
	for i := 1; i < len(value); i++ {
		ch := value[i]
		if (ch < '0' || ch > '9') && ch != '-' {
			return false
		}
	}
	return true
}

// LatestCreatedAt 返回整表最新的一条录入时间。
// created_at 是 "YYYY-MM-DD HH:MM:SS" 定长格式，字典序最大即时间最新，不用解析时间。
func LatestCreatedAt(list []Invoice) string {
	latest := ""
	for _, invoice := range list {
		if invoice.CreatedAt > latest {
			latest = invoice.CreatedAt
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
