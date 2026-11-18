package ledger

const FileName = "invoices.csv"

var Headers = []string{
	"发票号码", "发票代码", "票种", "开票日期", "价税合计",
	"报销人", "录入批次", "录入时间",
}

type Invoice struct {
	ID         int    `json:"id"`
	Number     string `json:"number"`
	Code       string `json:"code"`
	Kind       string `json:"kind"`
	IssueDate  string `json:"issue_date"`
	Total      string `json:"total"`
	Reimburser string `json:"reimburser"`
	Batch      string `json:"batch"`
	CreatedAt  string `json:"created_at"`
	NeedFill   bool   `json:"need_fill"`
	Duplicate  bool   `json:"duplicate"`
}

// DuplicateGroup 按 identityKey 聚合：同号码不同代码的老票是两张不同的票，
// 所以组里除了号码还要带代码，页面才能把它们区分开。
type DuplicateGroup struct {
	Number string    `json:"number"`
	Code   string    `json:"code"`
	Items  []Invoice `json:"items"`
}

// InvoiceKey 是判重时客户端提交的最小身份信息。
type InvoiceKey struct {
	Number string `json:"number"`
	Code   string `json:"code"`
}
