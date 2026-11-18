package files

import "testing"

func TestPreviewKind(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"发票.pdf", PreviewPDF},
		{"发票.PDF", PreviewPDF},
		{"扫描件.png", PreviewImage},
		{"扫描件.JPG", PreviewImage},
		{"照片.jpeg", PreviewImage},
		{"动图.gif", PreviewImage},
		{"图.webp", PreviewImage},
		{"图.bmp", PreviewImage},
		{"发票.xml", PreviewText},
		{"台账.csv", PreviewText},
		{"a.json", PreviewText},
		{"说明.txt", PreviewText},
		{"日志.log", PreviewText},
		{"readme.md", PreviewText},

		// 这三类是重点：不能因为"看着像文本/网页"就给预览
		{"发票.ofd", ""},
		{"打包.zip", ""},
		{"页面.html", ""},
		{"图标.svg", ""},
		{"报表.xlsx", ""},
		{"无扩展名", ""},
	}

	for _, c := range cases {
		if got := PreviewKind(c.name); got != c.want {
			t.Fatalf("PreviewKind(%q) = %q, 期望 %q", c.name, got, c.want)
		}
	}
}

func TestPreviewContentType(t *testing.T) {
	cases := map[string]string{
		"a.pdf":  "application/pdf",
		"a.png":  "image/png",
		"a.jpg":  "image/jpeg",
		"a.jpeg": "image/jpeg",
		"a.gif":  "image/gif",
		"a.webp": "image/webp",
		"a.bmp":  "image/bmp",
		// 文本一律 text/plain：XML 里的标签不能被当 HTML 解析
		"a.xml":  "text/plain; charset=utf-8",
		"a.csv":  "text/plain; charset=utf-8",
		"a.ofd":  "",
		"a.html": "",
		"a.svg":  "",
	}

	for name, want := range cases {
		if got := PreviewContentType(name); got != want {
			t.Fatalf("PreviewContentType(%q) = %q, 期望 %q", name, got, want)
		}
	}
}
