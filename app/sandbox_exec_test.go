package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// escapeTarget is somewhere this process may write but a confined command may
// not: the repository directory itself, which is outside every writable root the
// sandbox grants.
func escapeTarget(t *testing.T) string {
	t.Helper()
	working, err := os.Getwd()
	if err != nil {
		t.Fatalf("cannot resolve the working directory: %v", err)
	}
	return filepath.Join(working, "vl-sandbox-escape-"+t.Name()+".txt")
}

func TestSandboxLaunchersOfferEveryMechanismThisHostHas(t *testing.T) {
	workspace := t.TempDir()
	if _, _, err := sandboxLaunchers(workspace, "true"); err != nil {
		t.Fatalf("sandboxLaunchers: %v", err)
	}
	launchers, _, err := sandboxLaunchers(workspace, "printf hi > a.txt")
	if err != nil {
		t.Fatal(err)
	}
	if len(launchers) == 0 {
		t.Skip("this host provides no kernel sandbox")
	}
	absolute, _ := filepath.Abs(workspace)
	if runtime.GOOS == "linux" {
		first := launchers[0]
		if first.backend == "bwrap" {
			joined := strings.Join(first.args, " ")
			if !strings.Contains(joined, "--ro-bind / /") {
				t.Fatalf("the world must be mounted read-only first: %v", first.args)
			}
			if !strings.Contains(joined, "--bind "+absolute+" "+absolute) {
				t.Fatalf("the workspace must be bound back writable: %v", first.args)
			}
			if !strings.Contains(joined, "--chdir "+absolute) {
				t.Fatalf("the command must start in the workspace: %v", first.args)
			}
		}
		// Landlock stands behind bubblewrap whenever this host offers it.
		for _, launcher := range launchers {
			if launcher.backend != "landlock" {
				continue
			}
			if launcher.args[0] != "-sandbox-landlock" {
				t.Fatalf("the Landlock launcher is this binary in launcher mode: %v", launcher.args)
			}
			if !strings.Contains(strings.Join(launcher.args, " "), absolute) {
				t.Fatalf("the workspace must be a Landlock root: %v", launcher.args)
			}
			if launcher.args[len(launcher.args)-3] != "sh" {
				t.Fatalf("the command must be last: %v", launcher.args)
			}
		}
	}
}

func TestSandboxedCommandRefusesRootWorkspace(t *testing.T) {
	if runtime.GOOS != "linux" && runtime.GOOS != "darwin" {
		t.Skip("only hosts with a kernel sandbox reach this check")
	}
	if _, _, err := sandboxLaunchers(string(filepath.Separator), "true"); err == nil {
		t.Fatal("a sandbox rooted at the filesystem root grants the whole machine")
	}
	if _, _, err := sandboxLaunchers("", "true"); err == nil {
		t.Fatal("a sandbox without a workspace has no boundary")
	}
	if runtime.GOOS != "windows" {
		link := filepath.Join(t.TempDir(), "root-link")
		if err := os.Symlink(string(filepath.Separator), link); err == nil {
			if _, _, err := sandboxLaunchers(link, "true"); err == nil {
				t.Fatal("a workspace that links to the root grants the whole machine")
			}
		}
	}
}

func TestRunSandboxedCommandWritesInsideAndRefusesOutside(t *testing.T) {
	if runtime.GOOS != "linux" && runtime.GOOS != "darwin" {
		t.Skip("no kernel sandbox on this platform")
	}
	workspace := t.TempDir()
	if launchers, _, err := sandboxLaunchers(workspace, "true"); err != nil || len(launchers) == 0 {
		t.Skip("this host provides no kernel sandbox")
	}
	inside := filepath.Join(workspace, "inside.txt")
	result, err := runSandboxedCommand(workspace, "printf hi > inside.txt", 30)
	if err != nil {
		t.Fatalf("writing inside the workspace failed: %v (%s)", err, result.Output)
	}
	content, readErr := os.ReadFile(inside)
	if readErr != nil || strings.TrimSpace(string(content)) != "hi" {
		t.Fatalf("expected the workspace write to land: %q %v", content, readErr)
	}

	escape := escapeTarget(t)
	_ = os.Remove(escape)
	// Whether this process itself may write there decides whether the refusal
	// can be attributed; on a host that also confines the harness the refusal is
	// still checked, only the attribution is skipped.
	writable := os.WriteFile(escape, []byte("probe"), 0o644) == nil
	_ = os.Remove(escape)
	result, err = runSandboxedCommand(workspace, "printf nope > "+shellQuote(escape), 30)
	if err == nil {
		t.Fatalf("an escaping write must fail, got %+v", result)
	}
	if !looksLikeSandboxRefusal(result.Output) {
		t.Fatalf("a refusal should be recognisable as one: %q", result.Output)
	}
	if _, statErr := os.Stat(escape); statErr == nil {
		_ = os.Remove(escape)
		t.Fatalf("the escaping write reached %s", escape)
	}
	if writable {
		// The same path was writable for us a moment ago, so the refusal came
		// from the sandbox and not from a broken machine.
		if err := os.WriteFile(escape, []byte("ok"), 0o644); err != nil {
			t.Fatalf("expected the path to be writable for the test process: %v", err)
		}
		_ = os.Remove(escape)
	}
}

func TestSandboxSessionVocabulary(t *testing.T) {
	cases := []struct {
		payload map[string]interface{}
		want    bool
	}{
		{map[string]interface{}{"approval_mode": "sandbox"}, true},
		{map[string]interface{}{"approval_mode": "full_access"}, false},
		{map[string]interface{}{"approval_mode": "assistant"}, false},
		{map[string]interface{}{"approval_mode": "manual"}, true},
		{map[string]interface{}{}, true},
		{map[string]interface{}{"auto_approve": true}, false},
	}
	for _, item := range cases {
		if got := isSandboxSession(item.payload); got != item.want {
			t.Fatalf("%v: expected sandbox=%v, got %v", item.payload, item.want, got)
		}
	}
}

func TestLandlockLauncherConfinesTheChild(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Landlock only exists on Linux")
	}
	if reason := landlockAvailable(); reason != "" {
		t.Skipf("this kernel cannot apply Landlock: %s", reason)
	}
	workspace := t.TempDir()
	// The launcher keeps the caller's working directory, so the path is spelled
	// out the way `execCommand` would run it: inside the workspace.
	target := shellQuote(filepath.Join(workspace, "a.txt"))
	output, code := runLandlockChild(t, []string{workspace}, "printf hi > "+target+" && cat "+target)
	if code != 0 {
		t.Fatalf("a write inside the workspace must succeed: %d %s", code, output)
	}
	if content, err := os.ReadFile(filepath.Join(workspace, "a.txt")); err != nil || strings.TrimSpace(string(content)) != "hi" {
		t.Fatalf("expected the workspace write to land: %q %v", content, err)
	}

	escape := escapeTarget(t)
	_ = os.Remove(escape)
	output, code = runLandlockChild(t, []string{workspace}, "printf nope > "+shellQuote(escape))
	if code == 0 {
		t.Fatalf("an escaping write must fail, got %q", output)
	}
	if !looksLikeSandboxRefusal(output) {
		t.Fatalf("a refusal should be recognisable as one: %q", output)
	}
	if _, err := os.Stat(escape); err == nil {
		_ = os.Remove(escape)
		t.Fatalf("the escaping write reached %s", escape)
	}
}

// TestLandlockHelperProcess is the child half of the Landlock tests: the test
// binary re-executes itself, applies the ruleset and becomes the command, which
// is exactly what the agent's launcher mode does.
func TestLandlockHelperProcess(t *testing.T) {
	encoded := os.Getenv("VELOCE_LANDLOCK_ARGS")
	if encoded == "" {
		t.Skip("helper process only")
	}
	os.Exit(runLandlockLauncher(strings.Split(encoded, "\x1f")))
}

func runLandlockChild(t *testing.T, roots []string, command string) (string, int) {
	t.Helper()
	args := append(append([]string{}, roots...), "--", "sh", "-c", command)
	child := exec.Command(os.Args[0], "-test.run=TestLandlockHelperProcess")
	child.Env = append(os.Environ(), "VELOCE_LANDLOCK_ARGS="+strings.Join(args, "\x1f"))
	output, err := child.CombinedOutput()
	if err == nil {
		return string(output), 0
	}
	if exitErr, ok := err.(*exec.ExitError); ok {
		return string(output), exitErr.ExitCode()
	}
	t.Fatalf("the Landlock helper could not run: %v", err)
	return "", -1
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}
