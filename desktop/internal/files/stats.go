package files

import (
	"strings"
	"time"
)

type Stats struct {
	IncomingCount int   `json:"incoming_count"`
	IncomingBytes int64 `json:"incoming_bytes"`
	OutgoingCount int   `json:"outgoing_count"`
	OutgoingBytes int64 `json:"outgoing_bytes"`
	TodayCount    int   `json:"today_count"`
	TodayBytes    int64 `json:"today_bytes"`
}

func (s *Store) Stats() (Stats, error) {
	incoming, err := s.ListRecords()
	if err != nil {
		return Stats{}, err
	}
	outgoing, err := s.ListOutgoing()
	if err != nil {
		return Stats{}, err
	}

	stats := Stats{
		IncomingCount: len(incoming),
		OutgoingCount: len(outgoing),
	}
	today := time.Now().UTC().Format("2006-01-02")

	for _, record := range incoming {
		stats.IncomingBytes += record.Size
		if strings.HasPrefix(record.UploadedAt, today) {
			stats.TodayCount++
			stats.TodayBytes += record.Size
		}
	}
	for _, item := range outgoing {
		stats.OutgoingBytes += item.Size
	}
	return stats, nil
}
