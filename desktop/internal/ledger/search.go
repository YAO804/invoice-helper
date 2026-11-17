package ledger

import (
	"net/url"
	"sort"
	"strconv"
	"strings"
)

type Query struct {
	Keyword        string
	Number         string
	Code           string
	Kind           string
	Reimburser     string
	Batch          string
	DateFrom       string
	DateTo         string
	AmountMin      string
	AmountMax      string
	OnlyDuplicates bool
	OnlyNeedFill   bool
	Sort           string
}

func QueryFromValues(values url.Values) Query {
	return Query{
		Keyword:        values.Get("keyword"),
		Number:         values.Get("number"),
		Code:           values.Get("code"),
		Kind:           values.Get("kind"),
		Reimburser:     values.Get("reimburser"),
		Batch:          values.Get("batch"),
		DateFrom:       values.Get("date_from"),
		DateTo:         values.Get("date_to"),
		AmountMin:      values.Get("amount_min"),
		AmountMax:      values.Get("amount_max"),
		OnlyDuplicates: values.Get("only_duplicates") == "1" || values.Get("only_duplicates") == "true",
		OnlyNeedFill:   values.Get("only_need_fill") == "1" || values.Get("only_need_fill") == "true",
		Sort:           values.Get("sort"),
	}
}

func filter(list []Invoice, query Query) []Invoice {
	result := []Invoice{}
	for _, invoice := range list {
		if match(invoice, query) {
			result = append(result, invoice)
		}
	}
	return result
}

func match(invoice Invoice, query Query) bool {
	if query.OnlyDuplicates && !invoice.Duplicate {
		return false
	}
	if query.OnlyNeedFill && !invoice.NeedFill {
		return false
	}
	if !contains(invoice.Number, query.Number) || !contains(invoice.Code, query.Code) {
		return false
	}
	if !contains(invoice.Kind, query.Kind) || !contains(invoice.Reimburser, query.Reimburser) {
		return false
	}
	if !contains(invoice.Batch, query.Batch) {
		return false
	}
	if query.DateFrom != "" && invoice.IssueDate < query.DateFrom {
		return false
	}
	if query.DateTo != "" && invoice.IssueDate > query.DateTo {
		return false
	}
	if !matchAmount(invoice.Total, query) {
		return false
	}
	return query.Keyword == "" || strings.Contains(searchText(invoice), strings.ToLower(query.Keyword))
}

func contains(value string, part string) bool {
	return part == "" || strings.Contains(strings.ToLower(value), strings.ToLower(part))
}

func matchAmount(total string, query Query) bool {
	value, ok := amountValue(total)
	if !ok {
		return query.AmountMin == "" && query.AmountMax == ""
	}
	if min, ok := amountValue(query.AmountMin); ok && value < min {
		return false
	}
	if max, ok := amountValue(query.AmountMax); ok && value > max {
		return false
	}
	return true
}

func amountValue(value string) (float64, bool) {
	text := strings.ReplaceAll(strings.TrimSpace(value), ",", "")
	if text == "" {
		return 0, false
	}
	number, err := strconv.ParseFloat(text, 64)
	return number, err == nil
}

func searchText(invoice Invoice) string {
	return strings.ToLower(strings.Join([]string{
		invoice.Number, invoice.Code, invoice.Kind, invoice.IssueDate,
		invoice.Total, invoice.Reimburser, invoice.Batch, invoice.CreatedAt,
	}, " "))
}

// sortInvoices 按指定字段排序。默认按录入时间倒序（新录入在前）。
// 数值型/时间型字段用自然序，文本字段（报销人/号码）用不区分大小写的字典序。
func sortInvoices(list []Invoice, sortBy string) []Invoice {
	result := append([]Invoice(nil), list...)
	less := invoiceLess(sortBy)
	sort.SliceStable(result, func(i, j int) bool { return less(result[i], result[j]) })
	return result
}

func invoiceLess(sortBy string) func(Invoice, Invoice) bool {
	switch sortBy {
	case "number":
		return func(a, b Invoice) bool {
			cmp := strings.Compare(strings.ToLower(a.Number), strings.ToLower(b.Number))
			if cmp != 0 {
				return cmp < 0
			}
			return a.ID < b.ID
		}
	case "issued":
		return func(a, b Invoice) bool {
			if a.IssueDate != b.IssueDate {
				return a.IssueDate > b.IssueDate
			}
			return a.ID < b.ID
		}
	case "reimburser":
		return func(a, b Invoice) bool {
			la, lb := strings.ToLower(a.Reimburser), strings.ToLower(b.Reimburser)
			// 空报销人排最后，方便先看到已填写的
			if la == "" && lb != "" {
				return false
			}
			if la != "" && lb == "" {
				return true
			}
			if la != lb {
				return la < lb
			}
			return a.ID < b.ID
		}
	default: // created：录入时间倒序
		return func(a, b Invoice) bool {
			if a.CreatedAt != b.CreatedAt {
				return a.CreatedAt > b.CreatedAt
			}
			return a.ID > b.ID
		}
	}
}
