package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

func listWindowsDrives() (string, error) {
	if runtime.GOOS != "windows" {
		return "Windows drive listing is only available on Windows connectors.", nil
	}
	drives := []string{}
	for letter := 'A'; letter <= 'Z'; letter++ {
		root := fmt.Sprintf("%c:\\", letter)
		info, err := os.Stat(root)
		if err == nil && info.IsDir() {
			drives = append(drives, root)
		}
	}
	if len(drives) == 0 {
		return "(no Windows drives found)", nil
	}
	return strings.Join(drives, "\n"), nil
}
