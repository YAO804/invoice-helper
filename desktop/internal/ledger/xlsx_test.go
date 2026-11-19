package ledger

import (
	"bytes"
	"testing"

	"github.com/xuri/excelize/v2"
)

// buildXLSX 在内存里造工作簿，避免测试依赖仓库里的模板文件。
func buildXLSX(t *testing.T, sheets map[string][][]string) []byte {
	t.Helper()
	f := excelize.NewFile()
	first := true
	for name, rows := range sheets {
		sheet := name
		if first {
			// 默认 sheet 改名后，后续写单元格必须用新名字，不能用 Sheet1
			old := f.GetSheetName(0)
			if err := f.SetSheetName(old, name); err != nil {
				t.Fatal(err)
			}
			first = false
		} else {
			if _, err := f.NewSheet(sheet); err != nil {
				t.Fatal(err)
			}
		}
		for r, row := range rows {
			for c, value := range row {
				cell, _ := excelize.CoordinatesToCellName(c+1, r+1)
				if err := f.SetCellValue(sheet, cell, value); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestParseXLSXUsesHeaderNames(t *testing.T) {
	content := buildXLSX(t, map[string][][]string{
		"发票": {
			{"发票号码", "发票代码", "票种", "开票日期", "价税合计", "报销人"},
			{"032002300911", "00813251", "电子发票", "2024-10-28", "176.99", "张三"},
		},
	})

	invoices, err := parseInvoices(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(invoices) != 1 {
		t.Fatalf("解析数量错误: %+v", invoices)
	}
	got := invoices[0]
	if got.Number != "032002300911" || got.Code != "00813251" ||
		got.Total != "176.99" || got.Reimburser != "张三" || got.IssueDate != "2024-10-28" {
		t.Fatalf("表头映射错误: %+v", got)
	}
}

// 用户表头差一个字（发票号 vs 发票号码）必须被挡住，不能静默导入空号码。
func TestParseXLSXRejectsWrongHeaders(t *testing.T) {
	content := buildXLSX(t, map[string][][]string{
		"Sheet1": {
			{"发票代码", "发票号", "金额", "发票日期", "报销人"},
			{"00813251", "032002300911", "176.99", "2024-10-28", "张三"},
		},
	})

	if _, err := parseInvoices(content); err == nil {
		t.Fatal("非标准表头应报错，不能静默导入")
	}
}

// 模板前两张 sheet 是空的说明页，要跳到真正有表头的那张。
func TestParseXLSXSkipsEmptySheets(t *testing.T) {
	content := buildXLSX(t, map[string][][]string{
		"说明": {{}},
		"数据": {
			{"发票号码", "报销人"},
			{"12345678", "李四"},
		},
	})

	invoices, err := parseInvoices(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(invoices) != 1 || invoices[0].Number != "12345678" {
		t.Fatalf("跳过空 sheet 失败: %+v", invoices)
	}
}

func TestParseXLSXSkipsBlankRows(t *testing.T) {
	content := buildXLSX(t, map[string][][]string{
		"S": {
			{"发票号码", "报销人"},
			{"N001", "甲"},
			{"", ""},
			{"N002", "乙"},
		},
	})

	invoices, err := parseInvoices(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(invoices) != 2 {
		t.Fatalf("空行应被跳过，实际 %+v", invoices)
	}
}

// xlsx 与 CSV 必须走同一套判重口径，否则两种格式导入结果会不一致。
func TestXLSXAndCSVShareDedupe(t *testing.T) {
	store := newTestLedger(t)
	rows := [][]string{
		{"发票号码", "发票代码", "报销人"},
		{"N001", "C1", "甲"},
	}
	xlsxContent := buildXLSX(t, map[string][][]string{"S": rows})
	csvContent := []byte("发票号码,发票代码,报销人\nN001,C1,甲\n")

	xlsxPreview, err := store.PreviewImport(xlsxContent)
	if err != nil {
		t.Fatal(err)
	}
	csvPreview, err := store.PreviewImport(csvContent)
	if err != nil {
		t.Fatal(err)
	}
	if xlsxPreview.NewCount != csvPreview.NewCount ||
		xlsxPreview.DuplicateCount != csvPreview.DuplicateCount {
		t.Fatalf("两种格式判重不一致: xlsx=%+v csv=%+v", xlsxPreview, csvPreview)
	}

	count, err := store.CommitImport(xlsxContent)
	if err != nil || count != 1 {
		t.Fatalf("xlsx 写入失败: count=%d err=%v", count, err)
	}
	preview, err := store.PreviewImport(csvContent)
	if err != nil {
		t.Fatal(err)
	}
	if preview.DuplicateCount != 1 {
		t.Fatalf("xlsx 写入后 CSV 应判为重复: %+v", preview)
	}
}

func TestXLSXPreviewAndCommit(t *testing.T) {
	store := newTestLedger(t)
	content := buildXLSX(t, map[string][][]string{
		"S": {
			{"发票号码", "发票代码", "报销人"},
			{"N100", "C100", "张三"},
			{"", "", "空号码"},
		},
	})

	preview, err := store.PreviewImport(content)
	if err != nil {
		t.Fatal(err)
	}
	if preview.NewCount != 1 || preview.InvalidCount != 1 {
		t.Fatalf("预览统计错误: %+v", preview)
	}
	count, err := store.CommitImport(content)
	if err != nil || count != 1 {
		t.Fatalf("写入错误: count=%d err=%v", count, err)
	}
}
