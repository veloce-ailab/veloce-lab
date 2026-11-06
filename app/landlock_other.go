//go:build !linux

package main

// Landlock is a Linux LSM; elsewhere the fallback reports that it does not
// exist, and the sandbox falls through to its platform's own mechanism.

import (
	"fmt"
	"os"
	"runtime"
)

func landlockAvailable() string {
	return fmt.Sprintf("Landlock is a Linux feature, not available on %s", runtime.GOOS)
}

func runLandlockLauncher([]string) int {
	fmt.Fprintln(os.Stderr, "landlock-exec: this platform has no Landlock")
	return 125
}
