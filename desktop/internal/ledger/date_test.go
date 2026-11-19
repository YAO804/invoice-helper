package ledger

import "testing"

// 台账按字符串比较日期筛选，所以入库前必须先收成 YYYY-MM-DD。
func TestNormalizeIssueDate(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		// 已经是标准写法
		{"2024-10-28", "2024-10-28"},
		{" 2024-10-28 ", "2024-10-28"},
		// 斜杠、点、中文年月日
		{"2024/10/28", "2024-10-28"},
		{"2024.10.28", "2024-10-28"},
		{"2024年10月28日", "2024-10-28"},
		// 带时间
		{"2024-10-28 12:00:00", "2024-10-28"},
		{"2024/10/28 12:00", "2024-10-28"},
		{"2024-10-28T12:00:00+08:00", "2024-10-28"},
		// 没分隔符 / Excel 日期序列号
		{"20241028", "2024-10-28"},
		{"45678", "2025-01-21"},
		// 两位年份：靠「谁大于 12」定月日
		{"10-28-24", "2024-10-28"},
		{"28-10-2024", "2024-10-28"},
		{"2024-1-5", "2024-01-05"},
		// 空值照旧
		{"", ""},
		{"   ", ""},
		// 认不出的原样保留，不猜
		{"05-06-24", "05-06-24"},
		{"2024-02-30", "2024-02-30"},
		{"下个月", "下个月"},
		{"2024-13-01", "2024-13-01"},
	}

	for _, item := range cases {
		if got := NormalizeIssueDate(item.raw); got != item.want {
			t.Errorf("NormalizeIssueDate(%q) = %q，期望 %q", item.raw, got, item.want)
		}
	}
}

// 导入把日期收成标准写法，之后按日期筛选才不会漏票。
func TestImportNormalizesIssueDateSoDateFilterWorks(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "N001", IssueDate: "2024/10/28"},
		{Number: "N002", IssueDate: "10-28-24"},
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.CommitImport(content, true); err != nil {
		t.Fatal(err)
	}

	list, err := store.All()
	if err != nil {
		t.Fatal(err)
	}
	for _, invoice := range list {
		if invoice.IssueDate != "2024-10-28" {
			t.Fatalf("开票日期应归一化，实际 %+v", invoice)
		}
	}

	filtered, _, err := store.List(Query{DateFrom: "2024-10-01", DateTo: "2024-10-31"})
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered) != 2 {
		t.Fatalf("按日期筛选应两张都在，实际 %+v", filtered)
	}
}

// 认不出的日期照样导入，但预览必须提示：否则用户在筛选里找不到票，也不知道为什么。
func TestPreviewWarnsUnparseableIssueDate(t *testing.T) {
	store := newTestLedger(t)
	content, err := writeCSV([]Invoice{
		{Number: "N001", IssueDate: "2024/10/28"},
		{Number: "N002", IssueDate: "05-06-24"},
	})
	if err != nil {
		t.Fatal(err)
	}

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.DateWarningCount != 1 {
		t.Fatalf("应只提示认不出的那一张: %+v", preview)
	}
	if preview.Items[0].Warning != "" {
		t.Fatalf("能归一化的不该有提示: %+v", preview.Items[0])
	}
	if preview.Items[1].Warning == "" {
		t.Fatal("认不出的日期必须给提示")
	}
	if preview.Items[1].Invoice.IssueDate != "05-06-24" {
		t.Fatalf("认不出就原样保留，不要猜: %+v", preview.Items[1].Invoice)
	}
}

// xlsx 里的日期经常是 Excel 序列号或者带时间的完整时间戳，走的是同一套解析。
func TestXLSXIssueDateNormalized(t *testing.T) {
	content := buildXLSX(t, map[string][][]string{
		"S": {
			{"发票号码", "开票日期"},
			{"N001", "2024/10/28 12:00:00"},
			{"N002", "45678"},
		},
	})

	invoices, err := parseInvoices(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(invoices) != 2 {
		t.Fatalf("解析数量错误: %+v", invoices)
	}
	if invoices[0].IssueDate != "2024-10-28" {
		t.Fatalf("带时间的日期应只留日期: %+v", invoices[0])
	}
	if invoices[1].IssueDate != "2025-01-21" {
		t.Fatalf("Excel 序列号应换算成日期: %+v", invoices[1])
	}
}
