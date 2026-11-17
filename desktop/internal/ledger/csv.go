package ledger

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
)

func parseCSV(content []byte) ([]Invoice, error) {
	text := strings.TrimPrefix(string(content), "\ufeff")
	reader := csv.NewReader(strings.NewReader(text))
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return nil, err
	}
	index := headerIndex(header)

	list := []Invoice{}
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		list = append(list, invoiceFromRow(row, index))
	}
	return list, nil
}

func headerIndex(header []string) map[string]int {
	index := map[string]int{}
	for i, name := range header {
		index[strings.TrimSpace(name)] = i
	}
	return index
}

func invoiceFromRow(row []string, index map[string]int) Invoice {
	return Invoice{
		Number:     cell(row, index, "发票号码"),
		Code:       cell(row, index, "发票代码"),
		Kind:       cell(row, index, "票种"),
		IssueDate:  cell(row, index, "开票日期"),
		Total:      cell(row, index, "价税合计"),
		Reimburser: cell(row, index, "报销人"),
		Batch:      cell(row, index, "录入批次"),
		CreatedAt:  cell(row, index, "录入时间"),
	}
}

func cell(row []string, index map[string]int, name string) string {
	i, ok := index[name]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

func writeCSV(list []Invoice) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString("\ufeff")

	writer := csv.NewWriter(&buf)
	if err := writer.Write(Headers); err != nil {
		return nil, fmt.Errorf("写表头失败: %w", err)
	}

	for _, invoice := range list {
		if err := writer.Write(invoiceRow(invoice)); err != nil {
			return nil, fmt.Errorf("写记录失败: %w", err)
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func invoiceRow(invoice Invoice) []string {
	return []string{
		invoice.Number, invoice.Code, invoice.Kind, invoice.IssueDate,
		invoice.Total, invoice.Reimburser, invoice.Batch, invoice.CreatedAt,
	}
}
