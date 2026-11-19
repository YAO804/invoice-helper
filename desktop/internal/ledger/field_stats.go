package ledger

import (
	"sort"
	"strings"
)

// ValueStat 是某个文本字段某个取值的出现次数与最近使用时间。
type ValueStat struct {
	Value  string `json:"value"`
	Count  int    `json:"count"`
	LastAt string `json:"last_at"`
}

// FieldStats 统计某个字段的取值分布，供补录下拉的建议池使用。
//
// 网页分页之后前端手里只剩一页数据，靠这一页重建建议池会让「常用报销人」
// 缩水成「这一页出现过的报销人」，所以改由后端按整份台账算好。
func FieldStats(list []Invoice, field string) []ValueStat {
	index := map[string]*ValueStat{}
	for _, invoice := range list {
		value := fieldValue(invoice, field)
		if value == "" {
			continue
		}
		entry, ok := index[value]
		if !ok {
			entry = &ValueStat{Value: value}
			index[value] = entry
		}
		entry.Count++
		if invoice.CreatedAt > entry.LastAt {
			entry.LastAt = invoice.CreatedAt
		}
	}

	stats := make([]ValueStat, 0, len(index))
	for _, entry := range index {
		stats = append(stats, *entry)
	}
	// 次数优先：误填进报销人列的数字只出现一次，会排到后面去，
	// 真正的人名才不会被挤出下拉的前几条。
	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Count != stats[j].Count {
			return stats[i].Count > stats[j].Count
		}
		if stats[i].LastAt != stats[j].LastAt {
			return stats[i].LastAt > stats[j].LastAt
		}
		return stats[i].Value < stats[j].Value
	})
	return stats
}

func fieldValue(invoice Invoice, field string) string {
	switch field {
	case "reimburser":
		return strings.TrimSpace(invoice.Reimburser)
	case "kind":
		return strings.TrimSpace(invoice.Kind)
	default:
		return ""
	}
}
