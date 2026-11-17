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

type DuplicateGroup struct {
	Number string    `json:"number"`
	Items  []Invoice `json:"items"`
}
