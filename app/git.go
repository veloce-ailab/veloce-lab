package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"
)

// Git support for the chat's source-control panel. The local connector answers
// `git_status` and `git_action` in-process; this file is the external agent's
// half, so a workspace running on a connected device gets the same answers in
// the same JSON shape the dashboard already parses.

const (
	gitTimeout       = 60 * time.Second
	maxFileDiffChars = 16000
	maxDiffFiles     = 100
)

// gitWorkspaceFile mirrors `WorkspaceGitFile` from the local connector, diff
// included: the panel opens a file's diff straight from the status response.
type gitWorkspaceFile struct {
	Path      string `json:"path"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Diff      string `json:"diff,omitempty"`
}

type gitStatusResult struct {
	CurrentBranch string             `json:"current_branch"`
	CompareBranch string             `json:"compare_branch"`
	Branches      []string           `json:"branches"`
	ChangedFiles  int                `json:"changed_files"`
	Additions     int                `json:"additions"`
	Deletions     int                `json:"deletions"`
	Clean         bool               `json:"clean"`
	Files         []gitWorkspaceFile `json:"files"`
}

// git runs one git command in the workspace and returns its stdout.
func git(workspace string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = workspace
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("git timed out after %s", gitTimeout)
	}
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = strings.TrimSpace(stdout.String())
		}
		if message == "" {
			message = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", args[0], message)
	}
	return stdout.String(), nil
}

// renameTarget resolves `old => new` spellings to the name the user sees.
func renameTarget(file string) string {
	if index := strings.LastIndex(file, " => "); index >= 0 {
		return strings.TrimSpace(file[index+len(" => "):])
	}
	return file
}

func truncateDiff(diff string) string {
	if len(diff) > maxFileDiffChars {
		return diff[:maxFileDiffChars] + "\n(diff truncated)"
	}
	return diff
}

// gitStatusJSON builds the status response: with no compare branch it lists
// the worktree changes (porcelain status, counts against HEAD); with one it
// lists everything that differs from that branch, committed or not.
func gitStatusJSON(workspace string, compareBranch string) (string, error) {
	currentBranch, err := git(workspace, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	currentBranch = strings.TrimSpace(currentBranch)

	branchList, err := git(workspace, "branch", "--format=%(refname:short)")
	if err != nil {
		return "", err
	}
	branches := []string{}
	for _, line := range strings.Split(branchList, "\n") {
		if name := strings.TrimSpace(line); name != "" {
			branches = append(branches, name)
		}
	}
	sort.Strings(branches)

	base := "HEAD"
	if strings.TrimSpace(compareBranch) != "" {
		base = strings.TrimSpace(compareBranch)
	}

	// Per-file line counts, keyed by the path the user sees.
	numstat, err := git(workspace, "diff", "--numstat", base)
	if err != nil {
		return "", err
	}
	counts := map[string][2]int{}
	for _, line := range strings.Split(numstat, "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 3 {
			continue
		}
		file := renameTarget(strings.TrimSpace(strings.Join(parts[2:], "\t")))
		additions, deletions := parseCount(parts[0]), parseCount(parts[1])
		counts[file] = [2]int{additions, deletions}
	}

	var files []gitWorkspaceFile
	if base != "HEAD" {
		// The compare view lists what differs from the picked branch, so the
		// file set comes from name-status rather than worktree-only status.
		nameStatus, err := git(workspace, "diff", "--name-status", base)
		if err != nil {
			return "", err
		}
		for _, line := range strings.Split(nameStatus, "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.Split(line, "\t")
			if len(parts) < 2 {
				continue
			}
			file := renameTarget(strings.TrimSpace(strings.Join(parts[1:], "\t")))
			if file == "" {
				continue
			}
			count := counts[file]
			files = append(files, gitWorkspaceFile{
				Path:      file,
				Status:    strings.TrimSpace(parts[0]),
				Additions: count[0],
				Deletions: count[1],
			})
		}
	} else {
		porcelain, err := git(workspace, "status", "--porcelain")
		if err != nil {
			return "", err
		}
		for _, line := range strings.Split(porcelain, "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			status := strings.TrimSpace(line[:2])
			if status == "" {
				status = "??"
			}
			// Renames read `R  old -> new`; the new name is what the user sees.
			file := strings.TrimSpace(line[min(3, len(line)):])
			if index := strings.LastIndex(file, " -> "); index >= 0 {
				file = strings.TrimSpace(file[index+len(" -> "):])
			}
			count := counts[file]
			files = append(files, gitWorkspaceFile{
				Path:      file,
				Status:    status,
				Additions: count[0],
				Deletions: count[1],
			})
		}
	}
	if files == nil {
		files = []gitWorkspaceFile{}
	}

	// Untracked files have no diff to show — the panel says "untracked file"
	// instead — and only the first files are diffed, so a large change set
	// cannot turn the response into a stream.
	diffed := 0
	for index := range files {
		if diffed >= maxDiffFiles || strings.Contains(files[index].Status, "?") {
			continue
		}
		diff, err := git(workspace, "diff", base, "--", files[index].Path)
		if err != nil {
			continue
		}
		if trimmed := strings.TrimSpace(diff); trimmed != "" {
			files[index].Diff = truncateDiff(trimmed)
			diffed++
		}
	}

	totalAdditions, totalDeletions := 0, 0
	for _, file := range files {
		totalAdditions += file.Additions
		totalDeletions += file.Deletions
	}
	result := gitStatusResult{
		CurrentBranch: currentBranch,
		CompareBranch: strings.TrimSpace(compareBranch),
		Branches:      branches,
		ChangedFiles:  len(files),
		Additions:     totalAdditions,
		Deletions:     totalDeletions,
		Clean:         len(files) == 0,
		Files:         files,
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func parseCount(value string) int {
	count := 0
	for _, digit := range strings.TrimSpace(value) {
		if digit < '0' || digit > '9' {
			return 0
		}
		count = count*10 + int(digit-'0')
	}
	return count
}

// gitActionJSON runs one git action in the workspace. Staging is part of
// `commit` because that is what the chat's commit button means; `rollback`
// restores tracked files to HEAD and deliberately leaves untracked files
// alone.
func gitActionJSON(workspace string, action string, message string) (string, error) {
	switch action {
	case "commit":
		trimmed := strings.TrimSpace(message)
		if trimmed == "" {
			return "", fmt.Errorf("a commit message is required")
		}
		if _, err := git(workspace, "add", "-A"); err != nil {
			return "", err
		}
		output, err := git(workspace, "commit", "-m", trimmed)
		if err != nil {
			return "", err
		}
		if trimmed := strings.TrimSpace(output); trimmed != "" {
			return trimmed, nil
		}
		return "committed", nil
	case "push":
		branch, err := git(workspace, "rev-parse", "--abbrev-ref", "HEAD")
		if err != nil {
			return "", err
		}
		branch = strings.TrimSpace(branch)
		_, upstreamErr := git(workspace, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
		var output string
		if upstreamErr == nil {
			output, err = git(workspace, "push")
		} else {
			output, err = git(workspace, "push", "--set-upstream", "origin", branch)
		}
		if err != nil {
			return "", err
		}
		if trimmed := strings.TrimSpace(output); trimmed != "" {
			return trimmed, nil
		}
		return "pushed", nil
	case "rollback":
		output, err := git(workspace, "checkout", "--", ".")
		if err != nil {
			return "", err
		}
		if trimmed := strings.TrimSpace(output); trimmed != "" {
			return trimmed, nil
		}
		return "rolled back", nil
	default:
		return "", fmt.Errorf("unsupported git action %q", action)
	}
}
