package files

type Record struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256"`
	Path       string `json:"path"`
	Source     string `json:"source"`
	UploadedAt string `json:"uploaded_at"`
	Duplicate  bool   `json:"duplicate,omitempty"`
}

type OutgoingFile struct {
	Name       string `json:"name"`
	Size       int64  `json:"size"`
	ModifiedAt string `json:"modified_at"`
}
