package ledger

import "testing"

func TestLatestBatch(t *testing.T) {
	cases := []struct {
		name  string
		batch []string
		want  string
	}{
		{"空台账", nil, ""},
		{"单条", []string{"B20261118-093729-174"}, "B20261118-093729-174"},
		{"顺序无关", []string{"B20261117-100000-000", "B20261118-093729-174", "B20261118-090000-001"}, "B20261118-093729-174"},
		{"批次列为空", []string{"", "B20261118-093729-174", ""}, "B20261118-093729-174"},
		{"全为空", []string{"", ""}, ""},
		// 同一天不同毫秒：定长格式下字典序即时间序
		{"同秒比毫秒", []string{"B20261118-093729-174", "B20261118-093729-099"}, "B20261118-093729-174"},
	}

	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			list := []Invoice{}
			for i, batch := range item.batch {
				list = append(list, Invoice{ID: i + 1, Number: "N", Batch: batch})
			}
			if got := LatestBatch(list); got != item.want {
				t.Fatalf("最新批次错误: got=%q want=%q", got, item.want)
			}
		})
	}
}

// 卡片上的「最新批次」同时是筛选入口，绝不能跟着筛选结果变。
func TestListWithMetaLatestBatchIgnoresFilter(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	items, _, latest, err := store.ListWithMeta(Query{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || latest != "B002" {
		t.Fatalf("全量查询错误: items=%d latest=%q", len(items), latest)
	}

	// 只看老批次：结果里只剩 B001，但最新批次仍应是全表的 B002
	items, _, latest, err = store.ListWithMeta(Query{Batch: "B001"})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("筛选后应剩 1 条，实际 %d", len(items))
	}
	if latest != "B002" {
		t.Fatalf("最新批次应仍是 B002，实际 %q", latest)
	}
}

// List 的返回值和以前一致，别的调用方不用改。
func TestListStillReturnsTwoValues(t *testing.T) {
	store := newTestLedger(t)
	if _, _, err := store.AddInvoices(sampleInvoices()); err != nil {
		t.Fatal(err)
	}

	items, groups, err := store.List(Query{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || len(groups) != 0 {
		t.Fatalf("List 返回值错误: items=%d groups=%d", len(items), len(groups))
	}
}
