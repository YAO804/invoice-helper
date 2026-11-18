package ledger

// identityKey 是判重的唯一键：发票代码 + 发票号码。
//
// 数电票没有发票代码（20 位号码全国唯一），老版票只有「代码+号码」才唯一——
// 8 位号码跨年份、跨地区会撞号。金额和开票日期故意不参与判重：补录、格式抖动
// （147.0 与 147.00）都会让同一张票算出不同的键。漏判一张重复票就是重复报销，
// 代价远高于多留一条记录让用户自己删。
func identityKey(invoice Invoice) string {
	return invoice.Code + "|" + invoice.Number
}
