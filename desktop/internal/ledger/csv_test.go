package ledger

import "testing"

func TestCSVRoundTrip(t *testing.T) {
	content, err := writeCSV(sampleInvoices())
	if err != nil {
		t.Fatal(err)
	}

	list, err := parseCSV(content)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Number != "N001" || list[1].Total != "226.00" {
		t.Fatalf("CSV 往返错误: %+v", list)
	}
	if list[0].Batch != "B001" || list[0].CreatedAt != "2026-11-17 10:00:00" {
		t.Fatalf("批次或录入时间丢失: %+v", list[0])
	}
}

func TestParseLegacyCSV(t *testing.T) {
	// 旧版 12 列仍应能读：按列名取值，被删除的字段忽略，价税合计/批次正常解析
	legacy := "发票号码,发票代码,票种,开票日期,销方名称,销方税号,买方名称,买方税号,不含税金额,税额,价税合计,税率\n" +
		"N003,,普通发票,2026-08-03,丙公司,T003,个人,,50.00,6.50,56.50,13%\n"

	list, err := parseCSV([]byte(legacy))
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Number != "N003" || list[0].Total != "56.50" || list[0].Batch != "" {
		t.Fatalf("旧版 12 列解析错误: %+v", list)
	}
}
