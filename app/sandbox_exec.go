package main

// Kernel confinement for the commands a sandbox-mode session runs on this
// machine.
//
// The host decides *that* a command is sandboxed; this file decides *how* the
// operating system enforces it, and which mechanism to try first:
//
//	bwrap         mount namespace: the world mounted read-only, the workspace
//	              and the toolchain scratch areas bound back writable
//	landlock      the same write boundary applied as an LSM rule by this very
//	              binary, for hosts where namespaces are unavailable
//	sandbox-exec  the macOS equivalent of the mount-namespace backend
//
// A launcher that fails to start is reported and the next one is tried — a
// container that ships bubblewrap without user namespaces used to mean "no
// sandbox at all", and now it means Landlock takes over. Only when nothing can
// confine the command is it refused: running it unconfined would silently widen
// the session's terms.
//
// This is unrelated to sandbox.go, which prepares a throwaway copy of the
// workspace for administrator-managed cloud sandbox hosts.

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// sandboxRefusalHint is appended to a command whose write the kernel refused.
const sandboxRefusalHint = "Sandbox: the command may only write inside its workspace; the kernel refused everything else."

// sandboxLauncher is one way to start a confined command.
type sandboxLauncher struct {
	backend  string
	launcher string
	args     []string
}

// isSandboxSession reports whether the host asked for kernel confinement.
//
// A session that names no mode at all is treated as sandboxed: that is the
// host's default, and guessing "unconfined" for an older payload is the one
// guess that widens what a command may touch.
func isSandboxSession(payload map[string]interface{}) bool {
	switch strings.TrimSpace(stringArg(payload, "approval_mode")) {
	case "sandbox":
		return true
	case "full_access", "assistant":
		return false
	}
	return !boolArg(payload, "auto_approve")
}

// writableRoots are the directories a sandboxed command may still write: the
// workspace, then the host's scratch space (builds need it and it is thrown
// away with the command), the user cache directory (toolchain caches; it holds
// no credentials) and the device nodes a shell writes without thinking about it.
// VELOCE_SANDBOX_WRITABLE adds more, one path per line.
func writableRoots(workspace string) []string {
	roots := []string{workspace, os.TempDir()}
	if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
		roots = append(roots, filepath.Join(home, ".cache"))
	}
	if runtime.GOOS != "windows" {
		roots = append(roots, "/dev")
	}
	for _, line := range strings.Split(os.Getenv("VELOCE_SANDBOX_WRITABLE"), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			roots = append(roots, line)
		}
	}
	return roots
}

// sandboxWorkspace resolves and vets the folder a command is confined to.
func sandboxWorkspace(workspace string) (string, error) {
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		return "", errors.New("sandboxed commands require a workspace folder; none is set for this session")
	}
	abs, err := filepath.Abs(workspace)
	if err != nil {
		return "", err
	}
	if info, err := os.Stat(abs); err != nil || !info.IsDir() {
		return "", fmt.Errorf("folder not found: %s", abs)
	}
	if filepath.Dir(abs) == abs {
		return "", fmt.Errorf("sandboxed commands need a workspace below the filesystem root, not %q", abs)
	}
	// A workspace that is a symlink to the root would hand the machine back while
	// looking confined, so the check follows the link.
	if resolved, err := filepath.EvalSymlinks(abs); err == nil && filepath.Dir(resolved) == resolved {
		return "", fmt.Errorf("sandboxed commands need a workspace below the filesystem root, not %q (which resolves to %q)", abs, resolved)
	}
	return abs, nil
}

// distinctRoots keeps the existing, de-duplicated writable directories.
func distinctRoots(roots []string, skip string) []string {
	seen := map[string]bool{skip: true}
	kept := make([]string, 0, len(roots))
	for _, root := range roots {
		resolved := filepath.Clean(root)
		if resolved == "" || seen[resolved] {
			continue
		}
		if info, err := os.Stat(resolved); err != nil || !info.IsDir() {
			continue
		}
		seen[resolved] = true
		kept = append(kept, resolved)
	}
	return kept
}

// bwrapArgs mounts the world read-only and binds the writable roots back on top
// of it. Order is load-bearing: the later mounts win.
func bwrapArgs(workspace string, roots []string, temp string, command string) []string {
	args := []string{
		"--ro-bind", "/", "/",
		"--dev-bind", "/dev", "/dev",
		"--proc", "/proc",
		"--tmpfs", temp,
	}
	for _, root := range roots {
		args = append(args, "--bind", root, root)
	}
	return append(args,
		"--unshare-pid",
		"--die-with-parent",
		"--chdir", workspace,
		"--setenv", "TMPDIR", temp,
		"--", "sh", "-c", command,
	)
}

// seatbeltArgs is the macOS profile that denies writes outside the same roots.
func seatbeltArgs(roots []string, command string) []string {
	allowed := make([]string, 0, len(roots)+4)
	for _, root := range roots {
		allowed = append(allowed, fmt.Sprintf("(subpath %q)", root), fmt.Sprintf("(literal %q)", root))
	}
	allowed = append(allowed,
		`(subpath "/dev")`,
		`(literal "/dev/null")`,
		`(literal "/dev/stdout")`,
		`(literal "/dev/stderr")`,
	)
	profile := "(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* " +
		strings.Join(allowed, " ") + ")\n"
	return []string{"-p", profile, "sh", "-c", command}
}

// sandboxLaunchers lists the ways this host could confine the command, strongest
// first, together with why any of them could not even be prepared.
func sandboxLaunchers(workspace string, command string) ([]sandboxLauncher, []string, error) {
	abs, err := sandboxWorkspace(workspace)
	if err != nil {
		return nil, nil, err
	}
	temp := os.TempDir()
	roots := distinctRoots(writableRoots(abs), temp)
	var launchers []sandboxLauncher
	var reasons []string
	switch runtime.GOOS {
	case "linux":
		if launcher, err := exec.LookPath("bwrap"); err == nil {
			launchers = append(launchers, sandboxLauncher{"bwrap", launcher, bwrapArgs(abs, roots, temp, command)})
		} else {
			reasons = append(reasons, "bwrap: not installed")
		}
		if reason := landlockAvailable(); reason != "" {
			reasons = append(reasons, "landlock: "+reason)
		} else if self, err := os.Executable(); err == nil {
			// This binary is its own Landlock launcher: the child applies the
			// ruleset to itself and then becomes the command.
			args := append([]string{"-sandbox-landlock"}, roots...)
			args = append(append(args, "--"), "sh", "-c", command)
			launchers = append(launchers, sandboxLauncher{"landlock", self, args})
		}
	case "darwin":
		if launcher, err := exec.LookPath("sandbox-exec"); err == nil {
			launchers = append(launchers, sandboxLauncher{"sandbox-exec", launcher, seatbeltArgs(roots, command)})
		} else {
			reasons = append(reasons, "sandbox-exec: not installed")
		}
	default:
		reasons = append(reasons, fmt.Sprintf("no kernel sandbox exists on %s", runtime.GOOS))
	}
	return launchers, reasons, nil
}

// launcherFailed spots a launcher that could not do its job, which is the one
// case worth handing to the next backend. A command that merely exits non-zero
// is a result, not a reason to re-run it under something weaker.
func launcherFailed(candidate sandboxLauncher, result commandResult, execErr error) string {
	stderr := strings.TrimSpace(result.Stderr)
	first := strings.SplitN(stderr, "\n", 2)[0]
	exitCode := -1
	if result.ExitCode != nil {
		exitCode = *result.ExitCode
	}
	switch candidate.backend {
	case "bwrap":
		if execErr != nil && strings.HasPrefix(stderr, "bwrap: ") {
			return "bwrap: " + first
		}
	case "landlock":
		if strings.HasPrefix(stderr, "landlock-exec: ") || exitCode == 125 {
			if first == "" {
				first = fmt.Sprintf("exited %d", exitCode)
			}
			return "landlock: " + first
		}
	case "sandbox-exec":
		if strings.HasPrefix(stderr, "sandbox-exec: ") {
			return "sandbox-exec: " + first
		}
	}
	return ""
}

// looksLikeSandboxRefusal spots a refusal the sandbox itself produced, so the
// model is told why instead of reading "Read-only file system" as a broken box.
// The kernel's wording follows the command's locale, hence the extra spellings.
func looksLikeSandboxRefusal(output string) bool {
	lower := strings.ToLower(output)
	for _, marker := range []string{
		"read-only file system", "operation not permitted", "permission denied", "erofs", "eperm",
		"只读文件系统", "权限不够", "不允许的操作", "読み取り専用", "許可されていません",
	} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

// runSandboxedCommand runs one command with the kernel holding the boundary,
// falling back to the next launcher when the strongest one cannot start.
func runSandboxedCommand(workspace string, command string, timeoutSec int) (commandResult, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return commandResult{}, errors.New("command is required")
	}
	launchers, reasons, err := sandboxLaunchers(workspace, command)
	if err != nil {
		return commandResult{}, err
	}
	for _, candidate := range launchers {
		result, execErr := execCommand(candidate.launcher, candidate.args, workspace, timeoutSec)
		if reason := launcherFailed(candidate, result, execErr); reason != "" {
			reasons = append(reasons, reason)
			continue
		}
		if result.Output != "" && looksLikeSandboxRefusal(result.Output) {
			result.Output = strings.TrimSpace(result.Output + "\n" + sandboxRefusalHint)
			result.Result = result.Output
		}
		return result, execErr
	}
	return commandResult{}, fmt.Errorf(
		"permission denied: no kernel sandbox could confine this command on this host (%s)",
		strings.Join(reasons, "; "),
	)
}
