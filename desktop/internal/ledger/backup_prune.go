package ledger

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	backupKeepAllDays = 7   // 最近这些天全留：刚改错要能回退，这段最需要连续快照
	backupMaxFiles    = 300 // 数量兜底，防「一天改几千次」把天规则打穿
)

// BackupPolicy 决定旧备份留多久、留多少。
//
// 备份是写入前的整份快照，台账越大单份越大（2 千行约 180KB，2 万行约 1.8MB），
// 不设上限会无声把磁盘吃掉，所以要有明确规则而不是"永远留着"。
type BackupPolicy struct {
	KeepAllDays int // 最近这么多天全留
	KeepDays    int // 超过这个天数直接删
	MaxFiles    int // 上限，超出删最旧
}

// DefaultBackupPolicy 按保留天数给出默认策略。
func DefaultBackupPolicy(keepDays int) BackupPolicy {
	if keepDays <= 0 {
		keepDays = 90
	}
	return BackupPolicy{KeepAllDays: backupKeepAllDays, KeepDays: keepDays, MaxFiles: backupMaxFiles}
}

type backupFile struct {
	path string
	at   time.Time
}

// pruneBackups 按策略清理旧备份，返回删除数量。
//
// 认不出名字的文件一律保留：宁可少删，也不要删掉用户自己放进去的东西。
func pruneBackups(dir string, now time.Time, policy BackupPolicy) (int, error) {
	// MaxFiles 为 0 等于"一份都不留"，这是崩掉全部历史快照的写法，
	// 只可能来自忘了填字段的调用方，这里兜回默认上限。
	if policy.MaxFiles <= 0 {
		policy.MaxFiles = backupMaxFiles
	}

	files, err := collectBackups(dir)
	if err != nil {
		return 0, err
	}

	// 从新到旧遍历，同一天第一份（也就是最后一份）会被保留
	sort.Slice(files, func(i, j int) bool { return files[i].at.After(files[j].at) })

	keep := make([]bool, len(files))
	seenDay := map[string]bool{}
	keptCount := 0
	for i, file := range files {
		age := now.Sub(file.at)
		switch {
		case age <= time.Duration(policy.KeepAllDays)*24*time.Hour:
			keep[i] = true
		case age <= time.Duration(policy.KeepDays)*24*time.Hour:
			day := file.at.Format("20060102")
			if !seenDay[day] {
				seenDay[day] = true
				keep[i] = true
			}
		}
		if keep[i] {
			keptCount++
		}
	}

	// 数量兜底：从最旧的开始舍弃
	for i := len(files) - 1; i >= 0 && keptCount > policy.MaxFiles; i-- {
		if keep[i] {
			keep[i] = false
			keptCount--
		}
	}

	removed := 0
	for i, file := range files {
		if keep[i] {
			continue
		}
		if err := os.Remove(file.path); err == nil {
			removed++
		}
	}
	return removed, nil
}

// collectBackups 只收台账备份，其它文件（含 .tmp 残留）不碰。
func collectBackups(dir string) ([]backupFile, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	files := make([]backupFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !isBackupName(entry.Name()) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		at, ok := backupTime(entry.Name())
		if !ok {
			// 名字解析不出时间，说明不是我们生成的文件，一律不碰
			continue
		}
		files = append(files, backupFile{path: path, at: at})
	}
	return files, nil
}

func isBackupName(name string) bool {
	return strings.HasPrefix(name, backupNamePrefix) && strings.HasSuffix(name, ".csv")
}
