package ledger

import (
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

const issueDateLayout = "2006-01-02"

// excelSerialMin/Max 用来认出「Excel 把日期存成序列号」的情况（25569 ≈ 1970 年）。
var excelSerialRange = [2]float64{20000, 80000}

// NormalizeIssueDate 把各种写法的开票日期收成 YYYY-MM-DD。
//
// 台账的日期筛选是字符串比较（search.go 的 `IssueDate < DateFrom`），
// 一旦混进 "2024/10/28" 或 "10-28-24"，排序会错位、筛选会静默漏票，
// 所以入库前必须统一。认不出的格式原样返回，由预览提示用户自己改，
// 不猜：把 5 月 6 日猜成 6 月 5 日比留着原样更糟。
func NormalizeIssueDate(raw string) string {
	text := strings.TrimSpace(raw)
	if text == "" {
		return ""
	}
	if parsed, ok := parseIssueDate(text); ok {
		return parsed.Format(issueDateLayout)
	}
	return text
}

// IsISODate 判断是否已经是标准写法，供预览决定要不要提示用户。
func IsISODate(value string) bool {
	_, err := time.Parse(issueDateLayout, value)
	return err == nil
}

func parseIssueDate(text string) (time.Time, bool) {
	if parsed, ok := parseExcelSerial(text); ok {
		return parsed, true
	}

	// 日期后面可能跟着时间（"2024-10-28 12:00:00" / ISO 8601），只取日期那段
	datePart := text
	if i := strings.IndexAny(datePart, "T "); i > 0 {
		datePart = datePart[:i]
	}

	cleaned := strings.NewReplacer("/", "-", ".", "-", "年", "-", "月", "-", "日", "").Replace(datePart)
	fields := make([]string, 0, 3)
	for _, part := range strings.Split(cleaned, "-") {
		if part = strings.TrimSpace(part); part != "" {
			fields = append(fields, part)
		}
	}
	if len(fields) == 1 {
		return parseCompactDate(fields[0])
	}
	if len(fields) != 3 {
		return time.Time{}, false
	}
	return parseDateFields(fields[0], fields[1], fields[2])
}

// parseExcelSerial 处理单元格是数字、没套日期格式的情况：45000 就是 2023-03-15。
func parseExcelSerial(text string) (time.Time, bool) {
	serial, err := strconv.ParseFloat(text, 64)
	if err != nil || serial < excelSerialRange[0] || serial > excelSerialRange[1] {
		return time.Time{}, false
	}
	parsed, err := excelize.ExcelDateToTime(serial, false)
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

// parseCompactDate 处理 20241028 这种没分隔符的写法。
func parseCompactDate(field string) (time.Time, bool) {
	if len(field) != 8 {
		return time.Time{}, false
	}
	return parseDateFields(field[:4], field[4:6], field[6:8])
}

// parseDateFields 判断三段数字各是年月日的哪一段。
//
// 四年份放哪边很明确；两位年份一律按 20xx。剩下月/日的先后靠「谁大于 12」
// 来定：都小于等于 12 时无法判断，宁可不转也不猜错。
func parseDateFields(first, second, third string) (time.Time, bool) {
	var year, month, day string
	switch {
	case len(first) == 4:
		year, month, day = first, second, third
	case len(third) == 4:
		year = third
		switch {
		case atoi(first) > 12:
			day, month = first, second
		case atoi(second) > 12:
			month, day = first, second
		default:
			return time.Time{}, false
		}
	case len(first) == 2 && len(second) == 2 && len(third) == 2:
		year = "20" + third
		switch {
		case atoi(first) > 12:
			day, month = first, second
		case atoi(second) > 12:
			month, day = first, second
		default:
			return time.Time{}, false
		}
	default:
		return time.Time{}, false
	}

	y, m, d := atoi(year), atoi(month), atoi(day)
	if m < 1 || m > 12 || d < 1 || d > 31 {
		return time.Time{}, false
	}
	// 用回程校验挡掉 2 月 30 日这类不存在的日期
	parsed := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	if parsed.Month() != time.Month(m) || parsed.Day() != d {
		return time.Time{}, false
	}
	return parsed, true
}

func atoi(text string) int {
	value, err := strconv.Atoi(text)
	if err != nil {
		return 0
	}
	return value
}
