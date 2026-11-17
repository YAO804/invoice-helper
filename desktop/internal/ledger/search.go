package ledger

import (
	"net/url"
	"strconv"
	"strings"
)

type Query struct {
	Keyword        string
	Number         string
	Code           string
	Kind           string
	Seller         string
	Buyer          string
	Batch          string
	DateFrom       string
	DateTo         string
	AmountMin      string
	AmountMax      string
	OnlyDuplicates bool
	OnlyNeedFill   bool
}

func QueryFromValues(values url.Values) Query {
	return Query{
		Keyword:        values.Get("keyword"),
		Number:         values.Get("number"),
		Code:           values.Get("code"),
		Kind:           values.Get("kind"),
		Seller:         values.Get("seller"),
		Buyer:          values.Get("buyer"),
		Batch:          values.Get("batch"),
		DateFrom:       values.Get("date_from"),
		DateTo:         values.Get("date_to"),
		AmountMin:      values.Get("amount_min"),
		AmountMax:      values.Get("amount_max"),
		OnlyDuplicates: values.Get("only_duplicates") == "1" || values.Get("only_duplicates") == "true",
		OnlyNeedFill:   values.Get("only_need_fill") == "1" || values.Get("only_need_fill") == "true",
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
	if !contains(invoice.Kind, query.Kind) || !contains(invoice.SellerName, query.Seller) {
		return false
	}
	if !contains(invoice.BuyerName, query.Buyer) || !contains(invoice.Batch, query.Batch) {
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
		invoice.SellerName, invoice.SellerTaxID, invoice.BuyerName, invoice.BuyerTaxID,
		invoice.Amount, invoice.Tax, invoice.Total, invoice.TaxRate,
		invoice.Batch, invoice.CreatedAt,
	}, " "))
}
