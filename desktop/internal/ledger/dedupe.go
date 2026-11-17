package ledger

import "strings"

func duplicateGroups(list []Invoice) []DuplicateGroup {
	groups := map[string]*DuplicateGroup{}
	order := []string{}

	for _, invoice := range list {
		if invoice.Number == "" {
			continue
		}
		group, ok := groups[invoice.Number]
		if !ok {
			group = &DuplicateGroup{Number: invoice.Number}
			groups[invoice.Number] = group
			order = append(order, invoice.Number)
		}
		group.Items = append(group.Items, invoice)
	}

	result := []DuplicateGroup{}
	for _, number := range order {
		group := groups[number]
		if len(group.Items) > 1 {
			result = append(result, *group)
		}
	}
	return result
}

func markDuplicates(list []Invoice, groups []DuplicateGroup) []Invoice {
	numbers := map[string]bool{}
	for _, group := range groups {
		numbers[group.Number] = true
	}
	for i := range list {
		list[i].Duplicate = numbers[list[i].Number]
	}
	return list
}

func markNeedFill(list []Invoice) []Invoice {
	for i := range list {
		invoice := &list[i]
		invoice.NeedFill = strings.TrimSpace(invoice.Reimburser) == ""
	}
	return list
}
