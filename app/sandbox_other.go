//go:build !windows

package main

func defaultSandboxBackend() string {
	return "portable-copy"
}

func appContainerAvailable() bool {
	return false
}

func runAppContainerCommand(workspace string, command string, timeoutSec int) (commandResult, error) {
	return runCommandInDir(workspace, command, timeoutSec)
}
