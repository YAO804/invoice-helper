package ledger

import (
	"regexp"
	"strings"
)

// 金额存的是字符串，但必须能当数字用：金额筛选、合计都按数值比较。
// 容忍负号（红冲票）和任意小数位，不接受千分位、科学计数法和文字。
var numericTotalPattern = regexp.MustCompile(`^-?\d+(\.\d+)?$`)

type manualField struct {
	value string
	label string
}

// ValidateManualNew 校验网页手动新增：除报销人外字段齐全、金额是数字写法。
// 只用在新增接口；补录、扫码接收、CSV 导入都允许老票字段不全。
func ValidateManualNew(invoice Invoice) []string {
	fields := []manualField{
		{invoice.Number, "发票号码"}, {invoice.Code, "发票代码"},
		{invoice.Kind, "票种"}, {invoice.IssueDate, "开票日期"},
		{invoice.Total, "价税合计"},
	}
	problems := []string{}
	for _, field := range fields {
		if strings.TrimSpace(field.value) == "" {
			problems = append(problems, "请填写"+field.label)
		}
	}
	if strings.TrimSpace(invoice.Total) != "" && !numericTotalPattern.MatchString(strings.TrimSpace(invoice.Total)) {
		problems = append(problems, "价税合计必须填数字，例如 176.99")
	}
	return problems
}
