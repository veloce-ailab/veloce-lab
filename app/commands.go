package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type commandResult struct {
	Result   string
	Output   string
	Stdout   string
	Stderr   string
	ExitCode *int
}

func runCommand(workspace string, command string, timeoutSec int) (commandResult, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return commandResult{}, errors.New("command is required")
	}
	if timeoutSec <= 0 || timeoutSec > 120 {
		timeoutSec = 30
	}
	return runCommandInDir(workspace, command, timeoutSec)
}

func runCommandInDir(workspace string, command string, timeoutSec int) (commandResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/d", "/s", "/c", "chcp 65001>nul & "+command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	if strings.TrimSpace(workspace) != "" {
		cmd.Dir = workspace
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	stdoutText := strings.TrimSpace(decodeCommandOutput(stdout.Bytes()))
	stderrText := strings.TrimSpace(decodeCommandOutput(stderr.Bytes()))
	outputText := strings.TrimSpace(joinCommandOutput(stdoutText, stderrText))
	result := commandResult{
		Result: outputText,
		Output: outputText,
		Stdout: stdoutText,
		Stderr: stderrText,
	}
	if ctx.Err() == context.DeadlineExceeded {
		return result, fmt.Errorf("command timed out after %d seconds", timeoutSec)
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			code := exitErr.ExitCode()
			result.ExitCode = &code
		}
		return result, fmt.Errorf("command failed: %w", err)
	}
	if result.Result == "" {
		result.Result = "Command completed with no output"
		result.Output = result.Result
	}
	return result, nil
}

func joinCommandOutput(stdout string, stderr string) string {
	switch {
	case stdout == "":
		return stderr
	case stderr == "":
		return stdout
	default:
		var output bytes.Buffer
		_, _ = io.WriteString(&output, stdout)
		_, _ = io.WriteString(&output, "\n")
		_, _ = io.WriteString(&output, stderr)
		return output.String()
	}
}
