package registry

type Device struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Version  string `json:"version"`
	LastSeen string `json:"last_seen"`
	Uploads  int64  `json:"uploads"`
}

type Event struct {
	At     string `json:"at"`
	Kind   string `json:"kind"`
	Text   string `json:"text"`
	Device string `json:"device,omitempty"`
	Size   int64  `json:"size,omitempty"`
}

type data struct {
	Devices []Device `json:"devices"`
	Events  []Event  `json:"events"`
}
