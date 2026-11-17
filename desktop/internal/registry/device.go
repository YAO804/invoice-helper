package registry

import "fmt"

func (r *Registry) Touch(id string, name string, version string) (Device, error) {
	if id == "" {
		return Device{}, fmt.Errorf("device id 不能为空")
	}

	var result Device
	err := r.update(func(value *data) {
		for i := range value.Devices {
			if value.Devices[i].ID != id {
				continue
			}
			value.Devices[i].Name = fallback(name, value.Devices[i].Name)
			value.Devices[i].Version = fallback(version, value.Devices[i].Version)
			value.Devices[i].LastSeen = nowText()
			result = value.Devices[i]
			return
		}

		result = newDevice(id, name, version)
		value.Devices = append([]Device{result}, value.Devices...)
		if len(value.Devices) > maxDevices {
			value.Devices = value.Devices[:maxDevices]
		}
	})
	return result, err
}

func (r *Registry) MarkUpload(id string, name string, size int64) error {
	if id != "" {
		if _, err := r.Touch(id, "小程序", ""); err != nil {
			return err
		}
		if err := r.update(func(value *data) {
			for i := range value.Devices {
				if value.Devices[i].ID == id {
					value.Devices[i].Uploads++
					return
				}
			}
		}); err != nil {
			return err
		}
	}
	return r.MarkEvent("upload", "收到文件 "+name, id, size)
}

func newDevice(id string, name string, version string) Device {
	return Device{
		ID:       id,
		Name:     fallback(name, "小程序"),
		Version:  version,
		LastSeen: nowText(),
	}
}

func fallback(value string, other string) string {
	if value != "" {
		return value
	}
	return other
}
