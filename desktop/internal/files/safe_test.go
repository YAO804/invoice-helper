package files

import "testing"

func TestSafeName(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"test.xml", "test.xml"},
		{"../bad:name.xml", "bad_name.xml"},
		{"", "file"},
	}

	for _, item := range cases {
		if got := safeName(item.input); got != item.want {
			t.Fatalf("safeName(%q) = %q, want %q", item.input, got, item.want)
		}
	}
}

func TestValidStoredName(t *testing.T) {
	if !validStoredName("a.txt") {
		t.Fatal("普通文件名判断错误")
	}
	if validStoredName("../a.txt") {
		t.Fatal("含路径分隔符的文件名应该无效")
	}
}
