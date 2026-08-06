//go:build !windows

package main

import "strings"

func decodeCommandOutput(data []byte) string {
	return strings.ToValidUTF8(string(data), "")
}
