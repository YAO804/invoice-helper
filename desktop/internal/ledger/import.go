package ledger

type ImportItem struct {
	Invoice Invoice `json:"invoice"`
	Status  string  `json:"status"`
	Message string  `json:"message"`
	// Conflict 是撞上的那一张：来源可能是台账里的旧记录，也可能是本文件前面的行。
	// 只报「重复」不报「跟谁重复」，用户没法判断该不该跳，所以要把对手带出来。
	Conflict     *Invoice `json:"conflict,omitempty"`
	ConflictFrom string   `json:"conflict_from,omitempty"` // ledger | file
	// Warning 是「能导入但需要你知道」的提醒，目前用于认不出格式的开票日期。
	Warning string `json:"warning,omitempty"`
}

type ImportPreview struct {
	Total            int          `json:"total"`
	NewCount         int          `json:"new_count"`
	DuplicateCount   int          `json:"duplicate_count"`
	InvalidCount     int          `json:"invalid_count"`
	DateWarningCount int          `json:"date_warning_count"`
	Items            []ImportItem `json:"items"`
}

// ImportResult 与 ImportPreview 的三个计数一一对应：预览说多少，这里就写多少、跳多少。
// SkipDuplicates 记下这次是按哪种口径导的，界面据此说「跳过」还是「全量」。
type ImportResult struct {
	Imported       int  `json:"imported"`
	Duplicate      int  `json:"duplicate"`
	Invalid        int  `json:"invalid"`
	Skipped        int  `json:"skipped"`
	SkipDuplicates bool `json:"skip_duplicates"`
}

func (s *Store) PreviewImport(content []byte) (ImportPreview, error) {
	incoming, err := parseInvoices(content)
	if err != nil {
		return ImportPreview{}, err
	}

	existing, err := s.load()
	if err != nil {
		return ImportPreview{}, err
	}

	inLedger := identityIndex(existing)
	inFile := map[string]Invoice{}
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
		case hasKey(inLedger, invoice):
			item = duplicateItem(item, inLedger, "ledger")
			preview.DuplicateCount++
		case hasKey(inFile, invoice):
			item = duplicateItem(item, inFile, "file")
			preview.DuplicateCount++
		default:
			item.Status = "new"
			preview.NewCount++
			inFile[identityKey(invoice)] = invoice
		}
		if item.Status != "invalid" {
			item.Warning = issueDateWarning(item.Invoice)
			if item.Warning != "" {
				preview.DateWarningCount++
			}
		}
		preview.Items = append(preview.Items, item)
	}
	return preview, nil
}

// duplicateItem 把「跟谁撞了」填进预览项：台账里的记来源，本文件里的记第几条。
func duplicateItem(item ImportItem, index map[string]Invoice, from string) ImportItem {
	conflict := index[identityKey(item.Invoice)]
	item.Status = "duplicate"
	item.Message = duplicateMessage(item.Invoice)
	item.Conflict = &conflict
	item.ConflictFrom = from
	return item
}

// CommitImport 按用户的选择导入：skipDuplicates 为真时跳过重复，
// 为假时全量写入（用户明确选择「重复的也要」时不能替他做主）。
func (s *Store) CommitImport(content []byte, skipDuplicates bool) (ImportResult, error) {
	incoming, err := parseInvoices(content)
	if err != nil {
		return ImportResult{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	existing, err := s.load()
	if err != nil {
		return ImportResult{}, err
	}

	index := identityIndex(existing)
	batch := newBatch()
	result := ImportResult{SkipDuplicates: skipDuplicates}

	for _, invoice := range incoming {
		invoice.Batch = fallback(invoice.Batch, batch)
		invoice.CreatedAt = fallback(invoice.CreatedAt, nowText())
		if invoice.Number == "" {
			result.Invalid++
			result.Skipped++
			continue
		}
		if hasKey(index, invoice) {
			result.Duplicate++
			if skipDuplicates {
				result.Skipped++
				continue
			}
		}
		index[identityKey(invoice)] = invoice
		existing = append(existing, invoice)
		result.Imported++
	}
	if result.Imported == 0 {
		return result, nil
	}
	return result, s.save(existing)
}

// identityIndex 用「代码+号码」给已有发票建索引，与 duplicateGroups 保持同一口径。
// 同一个 key 有多张时留最早录入的那张，冲突提示才不会每次刷新都换人。
func identityIndex(list []Invoice) map[string]Invoice {
	result := map[string]Invoice{}
	for _, invoice := range list {
		if invoice.Number == "" {
			continue
		}
		key := identityKey(invoice)
		if _, ok := result[key]; !ok {
			result[key] = invoice
		}
	}
	return result
}

func hasKey(index map[string]Invoice, invoice Invoice) bool {
	_, ok := index[identityKey(invoice)]
	return ok
}

// issueDateWarning 只在日期仍不是 YYYY-MM-DD 时提示。
// 认不出的格式会原样入库，而台账是按字符串比较日期来筛选的，
// 这些票会被静默漏掉，所以必须在导入前让用户看见，而不是等他发现少了票。
func issueDateWarning(invoice Invoice) string {
	if invoice.IssueDate == "" || IsISODate(invoice.IssueDate) {
		return ""
	}
	return "开票日期「" + invoice.IssueDate + "」认不出格式，已原样保留，" +
		"按开票日期筛选时可能漏掉这张"
}

// duplicateMessage 说清楚是「号码撞了」还是「代码+号码都撞了」，方便用户判断。
func duplicateMessage(invoice Invoice) string {
	if invoice.Code == "" {
		return "发票号码已存在"
	}
	return "发票代码与号码都已存在"
}
