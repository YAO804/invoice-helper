package registry

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	fileName   = "registry.json"
	maxDevices = 50
	maxEvents  = 80
)

type Registry struct {
	path string
	mu   sync.Mutex
}

func New(root string) (*Registry, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}
	return &Registry{path: filepath.Join(root, fileName)}, nil
}

func (r *Registry) load() (data, error) {
	content, err := os.ReadFile(r.path)
	if errors.Is(err, os.ErrNotExist) {
		return data{Devices: []Device{}, Events: []Event{}}, nil
	}
	if err != nil {
		return data{}, err
	}

	value := data{Devices: []Device{}, Events: []Event{}}
	if err := json.Unmarshal(content, &value); err != nil {
		return data{}, err
	}
	return value, nil
}

func (r *Registry) save(value data) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.path, content, 0644)
}

func (r *Registry) update(fn func(*data)) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	value, err := r.load()
	if err != nil {
		return err
	}
	fn(&value)
	return r.save(value)
}

func (r *Registry) snapshot() ([]Device, []Event, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	value, err := r.load()
	if err != nil {
		return nil, nil, err
	}
	return value.Devices, value.Events, nil
}

func nowText() string {
	return time.Now().UTC().Format(time.RFC3339)
}
