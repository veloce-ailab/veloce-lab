package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRunCommandWithSandboxDetectsChangesWithoutWritingWorkspace(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "a.txt")
	if err := os.WriteFile(path, []byte("before"), 0644); err != nil {
		t.Fatal(err)
	}

	command := "printf after > a.txt"
	if runtime.GOOS == "windows" {
		command = "echo after> a.txt"
	}
	result, err := runCommandWithSandbox(workspace, command, 30, sandboxCommandOptions{
		SandboxID: "test-" + strings.ReplaceAll(t.Name(), "/", "-") + "-" + filepath.Base(workspace),
		Backend:   "portable-copy",
	})
	if err != nil {
		t.Fatalf("runCommandWithSandbox returned error: %v", err)
	}
	assertFileContent(t, path, "before")
	report := sandboxReportFromResult(t, result.Result)
	if !report.Changed || len(report.Mutations) != 1 {
		t.Fatalf("expected one sandbox mutation, got %+v", report)
	}
	if report.Mutations[0].Action != "write_file" || report.Mutations[0].Path != "a.txt" || !strings.HasPrefix(report.Mutations[0].Content, "after") {
		t.Fatalf("unexpected mutation: %+v", report.Mutations[0])
	}
}

func TestNormalizeSandboxBackendFallsBackWhenAppContainerUnavailable(t *testing.T) {
	if appContainerAvailable() {
		t.Skip("appcontainer backend is available on this host")
	}
	if got := normalizeSandboxBackend("appcontainer"); got != "portable-copy" {
		t.Fatalf("expected appcontainer request to fall back to portable-copy, got %q", got)
	}
}

func sandboxReportFromResult(t *testing.T, result string) sandboxCommandReport {
	t.Helper()
	marker := "SandboxChangeReport:\n```json\n"
	start := strings.LastIndex(result, marker)
	if start < 0 {
		t.Fatalf("missing sandbox report in %q", result)
	}
	start += len(marker)
	end := strings.Index(result[start:], "\n```")
	if end < 0 {
		t.Fatalf("unterminated sandbox report in %q", result)
	}
	var report sandboxCommandReport
	if err := json.Unmarshal([]byte(result[start:start+end]), &report); err != nil {
		t.Fatal(err)
	}
	return report
}
