package ledger

import (
	"fmt"
	"strings"
)

// 发票号码/代码的位数是可核验的客观依据，和小程序端 draft.js 的校验口径一致：
//
//	发票号码 8 位（增值税发票）或 20 位（数电票，全国唯一、没有发票代码）
//	发票代码 10 或 12 位
//
// 这套数字只用来发现「号码列填成了代码」，不用来判断真伪。
const (
	invoiceNumberShort = 8
	invoiceNumberLong  = 20
	invoiceCodeShort   = 10
	invoiceCodeLong    = 12
)

// NumberWarning 发现号码/代码位数可疑时给出提示，正常时返回空串。
//
// 只提示、不拦截、不自动交换：票种规则在变，猜错的代价是让一张真票变成废数据。
// 但必须说清后果——判重是「代码+号码」，两列填反后键也跟着反了，
// 重复票会被当成新票混进来，用户不看见提示根本不会发现。
func NumberWarning(invoice Invoice) string {
	number := strings.TrimSpace(invoice.Number)
	code := strings.TrimSpace(invoice.Code)

	// 空号码由「缺发票号码」负责；含非数字的可能是别的编号体系，不猜
	if number == "" || !allDigits(number) {
		return ""
	}
	if code != "" && !allDigits(code) {
		return ""
	}

	numberIsCode := len(number) == invoiceCodeShort || len(number) == invoiceCodeLong
	numberIsValid := len(number) == invoiceNumberShort || len(number) == invoiceNumberLong
	codeIsNumber := len(code) == invoiceNumberShort || len(code) == invoiceNumberLong
	codeIsValid := code == "" || len(code) == invoiceCodeShort || len(code) == invoiceCodeLong

	switch {
	case numberIsCode && codeIsNumber:
		return fmt.Sprintf("发票号码 %d 位像发票代码、发票代码 %d 位像发票号码，两列可能填反了；判重按「代码+号码」算，填反后查重会失效", len(number), len(code))
	case numberIsCode:
		return fmt.Sprintf("发票号码 %d 位，更像发票代码（代码 10/12 位、号码 8 位）；请核对两列，数电票号码是 20 位且没有代码", len(number))
	case !numberIsValid:
		return fmt.Sprintf("发票号码 %d 位，不像常见的 8 位或数电票 20 位，请核对是否填成了发票代码", len(number))
	case !codeIsValid:
		return fmt.Sprintf("发票代码 %d 位，不像常见的 10 或 12 位，请核对是否填成了发票号码", len(code))
	}
	return ""
}

func allDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, ch := range value {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

// countNumberWarnings 给预览和提交结果共用，保证两处说的是同一个数。
func countNumberWarnings(list []Invoice) int {
	count := 0
	for _, invoice := range list {
		if invoice.Number != "" && NumberWarning(invoice) != "" {
			count++
		}
	}
	return count
}
