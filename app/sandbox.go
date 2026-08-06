package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"unicode/utf8"
)

const maxSandboxDiffFiles = 200

type sandboxCommandOptions struct {
	SandboxID string
	Backend   string
}

type sandboxCommandReport struct {
	SandboxID   string                `json:"sandbox_id"`
	Backend     string                `json:"backend"`
	Workspace   string                `json:"workspace"`
	Changed     bool                  `json:"changed"`
	Files       []sandboxFileChange   `json:"files"`
	Mutations   []commitDeltaMutation `json:"mutations,omitempty"`
	Unsupported []string              `json:"unsupported,omitempty"`
	Truncated   bool                  `json:"truncated,omitempty"`
}

type sandboxFileChange struct {
	Path   string `json:"path"`
	Change string `json:"change"`
}

type sandboxFileState struct {
	Hash   string
	Mode   os.FileMode
	Binary bool
}

func runCommandWithSandbox(workspace string, command string, timeoutSec int, options sandboxCommandOptions) (commandResult, error) {
	options.SandboxID = sanitizeSandboxID(options.SandboxID)
	if options.SandboxID == "" {
		return runCommand(workspace, command, timeoutSec)
	}
	if strings.TrimSpace(workspace) == "" {
		return commandResult{}, errors.New("sandboxed commands require a workspace-limited connector session")
	}
	sandboxWorkspace, err := prepareSandboxWorkspace(workspace, options.SandboxID)
	if err != nil {
		return commandResult{}, err
	}
	result, commandErr := runSandboxBackendCommand(sandboxWorkspace, command, timeoutSec, options.Backend)
	report, diffErr := diffSandboxWorkspace(workspace, sandboxWorkspace, options)
	if diffErr != nil {
		if commandErr != nil {
			return result, fmt.Errorf("%v; sandbox diff failed: %w", commandErr, diffErr)
		}
		return result, diffErr
	}
	result = appendSandboxReport(result, report)
	return result, commandErr
}

func prepareSandboxWorkspace(workspace string, sandboxID string) (string, error) {
	root, err := sandboxRoot()
	if err != nil {
		return "", err
	}
	target := filepath.Join(root, sandboxID, "work")
	if _, err := os.Stat(target); err == nil {
		return target, nil
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return "", err
	}
	if err := copyWorkspace(workspace, target); err != nil {
		_ = os.RemoveAll(filepath.Dir(target))
		return "", err
	}
	return target, nil
}

func sandboxRoot() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(base) == "" {
		base = os.TempDir()
	}
	root := filepath.Join(base, "veloce-app", "sandboxes")
	if err := os.MkdirAll(root, 0755); err != nil {
		return "", err
	}
	return root, nil
}

func copyWorkspace(src string, dst string) error {
	src = cleanAbs(src)
	dst = cleanAbs(dst)
	return filepath.WalkDir(src, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return os.MkdirAll(dst, 0755)
		}
		name := entry.Name()
		if entry.IsDir() && (name == ".flai" || name == ".git") {
			return filepath.SkipDir
		}
		target := filepath.Join(dst, rel)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		mode := info.Mode()
		if mode&os.ModeSymlink != 0 {
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(link, target)
		}
		if entry.IsDir() {
			return os.MkdirAll(target, mode.Perm())
		}
		if !mode.IsRegular() {
			return nil
		}
		return copyFile(path, target, mode.Perm())
	})
}

func copyFile(src string, dst string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func diffSandboxWorkspace(realWorkspace string, sandboxWorkspace string, options sandboxCommandOptions) (sandboxCommandReport, error) {
	realFiles, err := snapshotWorkspace(realWorkspace)
	if err != nil {
		return sandboxCommandReport{}, err
	}
	sandboxFiles, err := snapshotWorkspace(sandboxWorkspace)
	if err != nil {
		return sandboxCommandReport{}, err
	}
	paths := make([]string, 0, len(realFiles)+len(sandboxFiles))
	seen := map[string]bool{}
	for path := range realFiles {
		seen[path] = true
		paths = append(paths, path)
	}
	for path := range sandboxFiles {
		if !seen[path] {
			paths = append(paths, path)
		}
	}
	sort.Strings(paths)

	report := sandboxCommandReport{
		SandboxID: sanitizeSandboxID(options.SandboxID),
		Backend:   normalizeSandboxBackend(options.Backend),
		Workspace: sandboxWorkspace,
	}
	for _, rel := range paths {
		realState, realExists := realFiles[rel]
		sandboxState, sandboxExists := sandboxFiles[rel]
		switch {
		case !realExists && sandboxExists:
			report.Files = append(report.Files, sandboxFileChange{Path: rel, Change: "created"})
			mutation, ok := sandboxWriteMutation(sandboxWorkspace, rel, sandboxState, sha256String(""))
			if ok {
				report.Mutations = append(report.Mutations, mutation)
			} else {
				report.Unsupported = append(report.Unsupported, rel)
			}
		case realExists && !sandboxExists:
			report.Files = append(report.Files, sandboxFileChange{Path: rel, Change: "deleted"})
			report.Mutations = append(report.Mutations, commitDeltaMutation{Action: "delete_file", Path: filepath.ToSlash(rel), BaseSHA256: realState.Hash})
		case realExists && sandboxExists && realState.Hash != sandboxState.Hash:
			report.Files = append(report.Files, sandboxFileChange{Path: rel, Change: "modified"})
			mutation, ok := sandboxWriteMutation(sandboxWorkspace, rel, sandboxState, realState.Hash)
			if ok {
				report.Mutations = append(report.Mutations, mutation)
			} else {
				report.Unsupported = append(report.Unsupported, rel)
			}
		}
		if len(report.Files) >= maxSandboxDiffFiles {
			report.Truncated = true
			break
		}
	}
	report.Changed = len(report.Files) > 0
	return report, nil
}

func snapshotWorkspace(root string) (map[string]sandboxFileState, error) {
	root = cleanAbs(root)
	files := map[string]sandboxFileState{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			name := entry.Name()
			if name == ".flai" || name == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		hash, binary, err := fileHashAndBinary(path)
		if err != nil {
			return err
		}
		files[rel] = sandboxFileState{Hash: hash, Mode: info.Mode().Perm(), Binary: binary}
		return nil
	})
	return files, err
}

func fileHashAndBinary(path string) (string, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false, err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), !utf8.Valid(data), nil
}

func sandboxWriteMutation(root string, rel string, state sandboxFileState, baseSHA256 string) (commitDeltaMutation, bool) {
	if state.Binary {
		return commitDeltaMutation{}, false
	}
	data, err := os.ReadFile(filepath.Join(root, rel))
	if err != nil || !utf8.Valid(data) {
		return commitDeltaMutation{}, false
	}
	overwrite := true
	createDirs := true
	return commitDeltaMutation{
		Action:     "write_file",
		Path:       filepath.ToSlash(rel),
		Content:    string(data),
		Overwrite:  &overwrite,
		CreateDirs: &createDirs,
		BaseSHA256: baseSHA256,
	}, true
}

func appendSandboxReport(result commandResult, report sandboxCommandReport) commandResult {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return result
	}
	section := "SandboxChangeReport:\n```json\n" + string(data) + "\n```"
	if strings.TrimSpace(result.Result) == "" || result.Result == "Command completed with no output" {
		result.Result = section
		result.Output = section
		return result
	}
	result.Result = strings.TrimSpace(result.Result) + "\n\n" + section
	result.Output = result.Result
	return result
}

func sanitizeSandboxID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('-')
		}
		if builder.Len() >= 120 {
			break
		}
	}
	return strings.Trim(builder.String(), "-_")
}

func normalizeSandboxBackend(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "appcontainer":
		if runtime.GOOS != "windows" || !appContainerAvailable() {
			return "portable-copy"
		}
		return "appcontainer"
	case "portable-copy", "copy":
		return "portable-copy"
	default:
		return defaultSandboxBackend()
	}
}

func runSandboxBackendCommand(workspace string, command string, timeoutSec int, backend string) (commandResult, error) {
	backend = normalizeSandboxBackend(backend)
	if backend == "appcontainer" {
		return runAppContainerCommand(workspace, command, timeoutSec)
	}
	return runCommandInDir(workspace, command, timeoutSec)
}
