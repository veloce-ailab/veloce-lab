package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// sandboxd uses the normal connector transport, but never accepts a workspace
// path from users. Every task is rooted under data-dir/sandboxes/<id>/work.
func (client connectorClient) sandboxdRoot(sandboxID string) (string, error) {
	sandboxID = sanitizeSandboxID(sandboxID)
	if sandboxID == "" {
		return "", errors.New("cloud sandbox id is required")
	}
	base := strings.TrimSpace(client.config.DataDir)
	if base == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(configDir, "veloce", "sandboxd")
	}
	return filepath.Join(base, "sandboxes", sandboxID), nil
}

func (client connectorClient) sandboxdWorkspace(sandboxID string) (string, error) {
	root, err := client.sandboxdRoot(sandboxID)
	if err != nil {
		return "", err
	}
	workspace := filepath.Join(root, "work")
	if err := os.MkdirAll(workspace, 0755); err != nil {
		return "", err
	}
	return workspace, nil
}

// cleanupSandboxdWorkspace removes the whole sandboxes/<id> directory after
// the control plane deleted the sandbox.
func (client connectorClient) cleanupSandboxdWorkspace(sandboxID string) (string, error) {
	root, err := client.sandboxdRoot(sandboxID)
	if err != nil {
		return "", err
	}
	if err := os.RemoveAll(root); err != nil {
		return "", err
	}
	return "Sandbox workspace removed", nil
}

type sandboxdSpec struct {
	Image          string                 `json:"image"`
	CPUCores       string                 `json:"cpu_cores"`
	MemoryMB       int                    `json:"memory_mb"`
	DiskGB         int                    `json:"disk_gb"`
	SecurityPolicy map[string]interface{} `json:"security_policy"`
}

func sandboxdSpecFromTask(payload map[string]interface{}) (sandboxdSpec, error) {
	value, ok := payload["cloud_sandbox_spec"]
	if !ok {
		return sandboxdSpec{}, errors.New("cloud sandbox spec is required")
	}
	data, err := json.Marshal(value)
	if err != nil {
		return sandboxdSpec{}, err
	}
	var spec sandboxdSpec
	if err := json.Unmarshal(data, &spec); err != nil {
		return sandboxdSpec{}, err
	}
	spec.Image = strings.TrimSpace(spec.Image)
	if spec.Image == "" {
		return sandboxdSpec{}, errors.New("cloud sandbox image is required")
	}
	if spec.MemoryMB < 128 {
		return sandboxdSpec{}, errors.New("cloud sandbox memory is invalid")
	}
	if strings.TrimSpace(spec.CPUCores) == "" {
		return sandboxdSpec{}, errors.New("cloud sandbox CPU is invalid")
	}
	return spec, nil
}

func sandboxdStringPolicy(policy map[string]interface{}, key, fallback string) string {
	value, _ := policy[key].(string)
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func sandboxdBoolPolicy(policy map[string]interface{}, key string) bool {
	value, _ := policy[key].(bool)
	return value
}

func sandboxdIntPolicy(policy map[string]interface{}, key string, fallback int) int {
	switch value := policy[key].(type) {
	case float64:
		if int(value) > 0 {
			return int(value)
		}
	case int:
		if value > 0 {
			return value
		}
	}
	return fallback
}

func sandboxdImageAllowed(policy map[string]interface{}, image string) bool {
	value, ok := policy["allowed_images"]
	if !ok {
		return true
	}
	items, ok := value.([]interface{})
	if !ok || len(items) == 0 {
		return true
	}
	for _, item := range items {
		if allowed, ok := item.(string); ok && strings.TrimSpace(allowed) == image {
			return true
		}
	}
	return false
}

func runSandboxdCommand(workspace, command string, timeoutSec int, spec sandboxdSpec) (commandResult, error) {
	if strings.TrimSpace(command) == "" {
		return commandResult{}, errors.New("command is required")
	}
	if timeoutSec <= 0 || timeoutSec > 120 {
		timeoutSec = 30
	}
	policy := spec.SecurityPolicy
	runtimeName := strings.ToLower(sandboxdStringPolicy(policy, "runtime", "docker"))
	if runtimeName == "appcontainer" {
		if runtime.GOOS != "windows" {
			return commandResult{}, errors.New("the appcontainer sandbox runtime requires a Windows sandbox host")
		}
		if !appContainerAvailable() {
			return commandResult{}, errors.New("Windows AppContainer APIs are unavailable on this sandbox host")
		}
		if platform := strings.ToLower(sandboxdStringPolicy(policy, "platform", "windows")); platform != "auto" && platform != "windows" {
			return commandResult{}, errors.New("the appcontainer sandbox runtime requires the Windows platform")
		}
		if network := sandboxdStringPolicy(policy, "network", "none"); network != "none" {
			return commandResult{}, errors.New("the appcontainer sandbox runtime does not permit network access")
		}
		return runAppContainerCommand(workspace, command, timeoutSec)
	}
	if runtimeName != "docker" {
		return commandResult{}, fmt.Errorf("unsupported sandbox runtime %q", runtimeName)
	}
	if !sandboxdImageAllowed(policy, spec.Image) {
		return commandResult{}, errors.New("container image is not allowed by this host policy")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()
	args := []string{"run", "--rm", "--init", "--workdir", "/workspace", "--mount", "type=bind,src=" + workspace + ",dst=/workspace", "--cpus", spec.CPUCores, "--memory", fmt.Sprintf("%dm", spec.MemoryMB), "--pids-limit", fmt.Sprintf("%d", sandboxdIntPolicy(policy, "pids_limit", 256)), "--cap-drop", "ALL", "--security-opt", "no-new-privileges"}
	switch sandboxdStringPolicy(policy, "network", "none") {
	case "none":
		args = append(args, "--network", "none")
	case "bridge":
		args = append(args, "--network", "bridge")
	default:
		return commandResult{}, errors.New("unsupported sandbox network policy")
	}
	if sandboxdBoolPolicy(policy, "read_only_rootfs") {
		args = append(args, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m")
	}
	args = append(args, spec.Image, "sh", "-lc", command)
	cmd := exec.CommandContext(ctx, "docker", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	stdoutText := strings.TrimSpace(decodeCommandOutput(stdout.Bytes()))
	stderrText := strings.TrimSpace(decodeCommandOutput(stderr.Bytes()))
	output := strings.TrimSpace(joinCommandOutput(stdoutText, stderrText))
	result := commandResult{Result: output, Output: output, Stdout: stdoutText, Stderr: stderrText}
	if ctx.Err() == context.DeadlineExceeded {
		return result, fmt.Errorf("command timed out after %d seconds", timeoutSec)
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			code := exitErr.ExitCode()
			result.ExitCode = &code
		}
		return result, fmt.Errorf("sandbox command failed: %w", err)
	}
	if result.Result == "" {
		result.Result = "Command completed with no output"
		result.Output = result.Result
	}
	return result, nil
}
