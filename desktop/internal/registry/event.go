package registry

func (r *Registry) MarkEvent(kind string, text string, device string, size int64) error {
	return r.update(func(value *data) {
		event := Event{
			At:     nowText(),
			Kind:   kind,
			Text:   text,
			Device: device,
			Size:   size,
		}
		value.Events = append([]Event{event}, value.Events...)
		if len(value.Events) > maxEvents {
			value.Events = value.Events[:maxEvents]
		}
	})
}

func (r *Registry) Snapshot() ([]Device, []Event, error) {
	return r.snapshot()
}
