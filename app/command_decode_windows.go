//go:build windows

package main

import (
	"strings"
	"syscall"
	"unicode/utf8"
	"unsafe"
)

const (
	windowsCodePageACP = 0
	windowsCodePageOEM = 1
)

var kernel32MultiByteToWideChar = syscall.NewLazyDLL("kernel32.dll").NewProc("MultiByteToWideChar")

func decodeCommandOutput(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	if utf8.Valid(data) {
		return string(data)
	}
	for _, codePage := range []uint32{windowsCodePageOEM, windowsCodePageACP} {
		if decoded, ok := decodeWindowsCodePage(data, codePage); ok && strings.TrimSpace(decoded) != "" {
			return decoded
		}
	}
	return strings.ToValidUTF8(string(data), "")
}

func decodeWindowsCodePage(data []byte, codePage uint32) (string, bool) {
	if len(data) == 0 {
		return "", true
	}
	size, _, _ := kernel32MultiByteToWideChar.Call(
		uintptr(codePage),
		0,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		0,
		0,
	)
	if size == 0 {
		return "", false
	}
	wide := make([]uint16, size)
	written, _, _ := kernel32MultiByteToWideChar.Call(
		uintptr(codePage),
		0,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		uintptr(unsafe.Pointer(&wide[0])),
		size,
	)
	if written == 0 {
		return "", false
	}
	return syscall.UTF16ToString(wide[:written]), true
}
