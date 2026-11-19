//go:build !windows

package main

// notifyUser 在非 Windows 平台不额外弹窗，日志已经写在终端里。
func notifyUser(string) {}
