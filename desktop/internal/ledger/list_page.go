package ledger

import (
	"net/url"
	"strconv"
)

const (
	// DefaultPageSize 是网页台账默认每页条数。
	DefaultPageSize = 20
	// MaxPageSize 兜住手改 URL 的情况：一次要十万条等于把分页关掉。
	MaxPageSize = 500
)

// Page 描述要取哪一页。Size 为 0 表示不分页（整份台账）。
type Page struct {
	Number int
	Size   int
}

// PageFromValues 从查询参数读 page / page_size。
//
// 两个都不传就是**全量**，这是刻意的默认：小程序判重、导出、报表要的都是整份台账，
// 默认分页会让这些调用方静默少算一批票。分页只在网页明说要哪一页时才生效。
func PageFromValues(values url.Values) Page {
	rawPage := values.Get("page")
	rawSize := values.Get("page_size")
	if rawPage == "" && rawSize == "" {
		return Page{}
	}

	size := DefaultPageSize
	if parsed, err := strconv.Atoi(rawSize); err == nil && parsed > 0 {
		size = parsed
	}
	if size > MaxPageSize {
		size = MaxPageSize
	}

	number := 1
	if parsed, err := strconv.Atoi(rawPage); err == nil && parsed > 0 {
		number = parsed
	}
	return Page{Number: number, Size: size}
}

// Paged 是一页数据加上「一共多少」这层信息。
//
// Total 是筛选后的总条数（不是当前页条数）：页脚要显示「共 N 张」，
// 拿当前页长度会写成 20。
type Paged struct {
	Items  []Invoice
	Total  int
	Number int
	Size   int
	Count  int // 总页数
}

// Paginate 切出指定页。页码越界时贴到最近的有效页：
// 删掉最后一页的最后一条后，用户还停在那一页，不该看到空白列表。
func Paginate(items []Invoice, page Page) Paged {
	total := len(items)
	if page.Size <= 0 {
		return Paged{Items: items, Total: total, Number: 1, Size: total, Count: 1}
	}

	count := (total + page.Size - 1) / page.Size
	if count < 1 {
		count = 1
	}
	number := page.Number
	if number < 1 {
		number = 1
	}
	if number > count {
		number = count
	}

	from := (number - 1) * page.Size
	if from > total {
		from = total
	}
	to := from + page.Size
	if to > total {
		to = total
	}
	return Paged{Items: items[from:to], Total: total, Number: number, Size: page.Size, Count: count}
}
