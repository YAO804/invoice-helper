package api

import (
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// 表单实时提示走接口拿文案，口径必须与导入预览完全一致，
// 否则用户会看到「导入说填反、手动录入说正常」这种自相矛盾的结果。
func TestNumberWarningEndpointUsesSameRule(t *testing.T) {
	handler, _ := newTestHandler(t)

	cases := []struct {
		number string
		code   string
		want   string
		field  string
	}{
		{"032002300911", "00813251", "两列可能填反了", "both"},
		{"032002300911", "", "更像发票代码", "number"},
		// 截图里的场景：号码 8 位正常、代码 8 位不对，提示必须归属代码列
		{"12322222", "12312312", "发票代码 8 位", "code"},
		{"00813251", "032002300911", "", ""},
		{"24312000000123456789", "", "", ""},
		{"", "032002300911", "", ""},
	}
	for _, tc := range cases {
		values := url.Values{"number": {tc.number}, "code": {tc.code}}
		rec := request(t, handler, http.MethodGet, "/api/invoices/number-warning?"+values.Encode(), nil, "")
		if rec.Code != http.StatusOK {
			t.Fatalf("状态码错误: %d %s", rec.Code, rec.Body.String())
		}
		var result struct {
			Warning string `json:"warning"`
			Field   string `json:"field"`
		}
		decodeJSON(t, rec, &result)
		if !containsText(result.Warning, tc.want) {
			t.Fatalf("号码 %q 代码 %q 的提示应含「%s」，实际 %q", tc.number, tc.code, tc.want, result.Warning)
		}
		if result.Field != tc.field {
			t.Fatalf("号码 %q 代码 %q 的提示应归属 %q 列，实际 %q", tc.number, tc.code, tc.field, result.Field)
		}
	}
}

func containsText(value, part string) bool {
	return strings.Contains(value, part)
}

// 保存后的结果也要带同一句话：实时接口失败时，这是最后一道提醒。
func TestCreateAndUpdateReturnNumberWarning(t *testing.T) {
	handler, _ := newTestHandler(t)

	created := request(t, handler, http.MethodPost, "/api/invoices/manual",
		jsonBody(t, map[string]any{
			"number": "032002300911", "code": "00813251", "kind": "数电票",
			"issue_date": "2026-11-18", "total": "66.00",
		}), "application/json")
	if created.Code != http.StatusCreated {
		t.Fatalf("新增状态码错误: %d", created.Code)
	}
	var createResult struct {
		NumberWarning string `json:"number_warning"`
	}
	decodeJSON(t, created, &createResult)
	if !containsText(createResult.NumberWarning, "两列可能填反了") {
		t.Fatalf("新增结果应带位数提示，实际 %q", createResult.NumberWarning)
	}

	updated := request(t, handler, http.MethodPut, "/api/invoices/1",
		jsonBody(t, map[string]any{"number": "00813251", "code": "032002300911"}), "application/json")
	if updated.Code != http.StatusOK {
		t.Fatalf("补录状态码错误: %d", updated.Code)
	}
	var updateResult struct {
		NumberWarning string `json:"number_warning"`
	}
	decodeJSON(t, updated, &updateResult)
	if updateResult.NumberWarning != "" {
		t.Fatalf("改成正确位数后不该再提示，实际 %q", updateResult.NumberWarning)
	}
}
