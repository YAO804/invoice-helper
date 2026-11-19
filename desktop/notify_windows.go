//go:build windows

package main

import "golang.org/x/sys/windows"

// notifyUser 用系统对话框把原因摆到用户面前。
//
// 发布包里的启动 bat 用 `start /MIN` 拉起 exe，窗口是收起的：只往控制台写日志，
// 用户那头看到的就是「双击了没反应」，然后 bat 报「15 秒内没启动起来」。
func notifyUser(message string) {
	title, err := windows.UTF16PtrFromString("攒票小匣")
	if err != nil {
		return
	}
	text, err := windows.UTF16PtrFromString(message)
	if err != nil {
		return
	}
	_, _ = windows.MessageBox(0, text, title, windows.MB_OK|windows.MB_ICONINFORMATION)
}
