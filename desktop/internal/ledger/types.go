package ledger

const FileName = "invoices.csv"

var Headers = []string{
	"发票号码", "发票代码", "票种", "开票日期", "销方名称", "销方税号",
	"买方名称", "买方税号", "不含税金额", "税额", "价税合计", "税率",
	"录入批次", "录入时间",
}

type Invoice struct {
	ID          int    `json:"id"`
	Number      string `json:"number"`
	Code        string `json:"code"`
	Kind        string `json:"kind"`
	IssueDate   string `json:"issue_date"`
	SellerName  string `json:"seller_name"`
	SellerTaxID string `json:"seller_tax_id"`
	BuyerName   string `json:"buyer_name"`
	BuyerTaxID  string `json:"buyer_tax_id"`
	Amount      string `json:"amount"`
	Tax         string `json:"tax"`
	Total       string `json:"total"`
	TaxRate     string `json:"tax_rate"`
	Batch       string `json:"batch"`
	CreatedAt   string `json:"created_at"`
	NeedFill    bool   `json:"need_fill"`
	Duplicate   bool   `json:"duplicate"`
}

type DuplicateGroup struct {
	Number string    `json:"number"`
	Items  []Invoice `json:"items"`
}
