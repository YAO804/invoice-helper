package ledger

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/xuri/excelize/v2"
)

// xlsxSignature 是 ZIP 本地文件头的前两字节（PK）。
// 只靠扩展名不够：用户可能把 CSV 改名成 xlsx，或上传浏览器下载的伪 xlsx。
func isXLSX(content []byte) bool {
	return len(content) >= 2 && content[0] == 'P' && content[1] == 'K'
}

// parseXLSX 把工作簿第一张有数据的 sheet 读成发票列表。
//
// 复用 CSV 的 headerIndex / invoiceFromRow，确保两种格式的表头映射和判重口径
// 完全一致；格式差异只体现在「怎么把单元格变成字符串」这一步。
func parseXLSX(content []byte) ([]Invoice, error) {
	file, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("打开 Excel 失败: %w", err)
	}
	defer file.Close()

	for _, sheet := range file.GetSheetList() {
		rows, err := file.GetRows(sheet)
		if err != nil {
			return nil, fmt.Errorf("读取工作表 %s 失败: %w", sheet, err)
		}
		if len(rows) == 0 {
			continue
		}
		header := make([]string, len(rows[0]))
		for i, cell := range rows[0] {
			header[i] = strings.TrimSpace(cell)
		}
		index := headerIndex(header)
		if !hasInvoiceHeaders(index) {
			continue // 跳过空 sheet 或说明页，找第一张像台账的表
		}

		list := []Invoice{}
		for _, row := range rows[1:] {
			if isBlankRow(row) {
				continue
			}
			list = append(list, invoiceFromRow(row, index))
		}
		return list, nil
	}
	return nil, fmt.Errorf("未找到包含发票表头的工作表，请使用模板填写")
}

// hasInvoiceHeaders 至少要有「发票号码」这一列，否则不是台账表。
// 光看 sheet 名不可靠——用户可能把模板改名为「2024 年」。
func hasInvoiceHeaders(index map[string]int) bool {
	_, ok := index["发票号码"]
	return ok
}

// isBlankRow 跳过用户习惯留的空行和小计前的分隔行。
func isBlankRow(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}
