package registry

import "testing"

func newTestRegistry(t *testing.T) *Registry {
	t.Helper()

	registry, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return registry
}

func TestTouchAndSnapshot(t *testing.T) {
	registry := newTestRegistry(t)

	device, err := registry.Touch("phone-1", "手机", "1.0.0")
	if err != nil {
		t.Fatal(err)
	}
	if device.Name != "手机" || device.LastSeen == "" {
		t.Fatalf("设备记录错误: %+v", device)
	}

	devices, events, err := registry.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || len(events) != 0 {
		t.Fatalf("快照错误: devices=%d events=%d", len(devices), len(events))
	}
}

func TestMarkUpload(t *testing.T) {
	registry := newTestRegistry(t)

	if err := registry.MarkUpload("phone-1", "a.xml", 12); err != nil {
		t.Fatal(err)
	}

	devices, events, err := registry.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || devices[0].Uploads != 1 {
		t.Fatalf("上传计数错误: %+v", devices)
	}
	if len(events) != 1 || events[0].Kind != "upload" || events[0].Size != 12 {
		t.Fatalf("上传事件错误: %+v", events)
	}
}
