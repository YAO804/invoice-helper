package ledger

import "strings"

func duplicateGroups(list []Invoice) []DuplicateGroup {
	groups := map[string]*DuplicateGroup{}
	order := []string{}

	for _, invoice := range list {
		if invoice.Number == "" {
			continue
		}
		key := identityKey(invoice)
		group, ok := groups[key]
		if !ok {
			group = &DuplicateGroup{Number: invoice.Number, Code: invoice.Code}
			groups[key] = group
			order = append(order, key)
		}
		group.Items = append(group.Items, invoice)
	}

	result := []DuplicateGroup{}
	for _, key := range order {
		group := groups[key]
		if len(group.Items) > 1 {
			result = append(result, *group)
		}
	}
	return result
}

func markDuplicates(list []Invoice, groups []DuplicateGroup) []Invoice {
	keys := map[string]bool{}
	for _, group := range groups {
		keys[identityKey(Invoice{Code: group.Code, Number: group.Number})] = true
	}
	for i := range list {
		list[i].Duplicate = keys[identityKey(list[i])]
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
