package main

// File actions with the same answers the built-in connector gives.
//
// The two connectors are interchangeable from the host's side, so an action
// cannot mean one thing here and another there: the web panel parses these
// results as JSON, the tools read `content` out of them, and the model sees the
// same refusals. Everything below is therefore shaped after
// `packages/device-local/src/actions.ts` — same fields, same path rules (an
// absolute path inside the workspace is fine, anything outside is refused) and
// the same willingness to overwrite, replace every occurrence and report line
// counts.
//
// The plain-text helpers in files.go stay for `sandboxd` mode, which answers a
// different host.

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	maxTextBytes  = 2 * 1024 * 1024
	maxDirEntries = 1000
)

// actionPath resolves `path` the way the built-in connector does: relative
// paths start at the workspace, absolute ones are accepted only when they stay
// inside it, and a session without a workspace accepts absolute paths alone.
func actionPath(workspace string, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	workspace = strings.TrimSpace(workspace)
	if workspace == "" {
		if requested == "" {
			return "", errors.New("path is required")
		}
		if !filepath.IsAbs(requested) {
			return "", errors.New("path must be absolute when no workspace is selected")
		}
		return filepath.Clean(requested), nil
	}
	root := cleanAbs(workspace)
	target := requested
	if !filepath.IsAbs(target) {
		target = filepath.Join(root, target)
	}
	target = filepath.Clean(target)
	relative, err := filepath.Rel(root, target)
	if err != nil {
		return "", err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", fmt.Errorf("path %q is outside the workspace %q", requested, workspace)
	}
	return target, nil
}

// jsonAction turns one action's answer into the task result the host parses.
// Everything the built-in connector answers inline comes back as JSON here, so a
// caller reads the same fields whichever connector ran the action.
func jsonAction(value interface{}, err error) (taskResult, error) {
	if err != nil {
		return taskResult{}, err
	}
	encoded, encodeErr := json.Marshal(value)
	if encodeErr != nil {
		return taskResult{}, encodeErr
	}
	return textTaskResult(string(encoded)), nil
}

type directoryEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"`
	Size int64  `json:"size"`
}

type directoryListing struct {
	Path    string           `json:"path"`
	Entries []directoryEntry `json:"entries"`
}

// actionListDirectory answers both `list_directory` and `list_files`.
func actionListDirectory(workspace string, payload map[string]interface{}) (directoryListing, error) {
	target, err := actionPath(workspace, stringArg(payload, "path"))
	if err == nil && target == "" {
		target = cleanAbs(workspace)
	}
	if err != nil {
		return directoryListing{}, err
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return directoryListing{}, fmt.Errorf("folder not found: %s", target)
		}
		return directoryListing{}, err
	}
	sort.Slice(entries, func(left, right int) bool {
		if entries[left].IsDir() != entries[right].IsDir() {
			return entries[left].IsDir()
		}
		return strings.ToLower(entries[left].Name()) < strings.ToLower(entries[right].Name())
	})
	listing := directoryListing{Path: target, Entries: []directoryEntry{}}
	for index, entry := range entries {
		if index >= maxDirEntries {
			break
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			continue
		}
		kind := "file"
		if entry.IsDir() {
			kind = "directory"
		}
		listing.Entries = append(listing.Entries, directoryEntry{
			Name: entry.Name(),
			Path: filepath.Join(target, entry.Name()),
			Type: kind,
			Size: info.Size(),
		})
	}
	return listing, nil
}

type fileContent struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func actionReadFile(workspace string, payload map[string]interface{}) (fileContent, error) {
	target, err := actionPath(workspace, stringArg(payload, "path"))
	if err != nil {
		return fileContent{}, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return fileContent{}, fmt.Errorf("file not found: %s", target)
	}
	if info.IsDir() {
		return fileContent{}, fmt.Errorf("not a file: %s", target)
	}
	if info.Size() > maxTextBytes {
		return fileContent{}, fmt.Errorf("file is larger than 2 MiB: %s", target)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return fileContent{}, err
	}
	if strings.ContainsRune(string(data), 0) || !utf8.Valid(data) {
		return fileContent{}, errors.New("binary files cannot be opened in the text editor")
	}
	return fileContent{Path: target, Content: string(data)}, nil
}

type fileMutation struct {
	Path         string `json:"path"`
	Size         int    `json:"size"`
	Replacements int    `json:"replacements"`
	Added        int    `json:"added"`
	Removed      int    `json:"removed"`
}

func actionWriteFile(workspace string, payload map[string]interface{}) (fileMutation, error) {
	target, err := actionPath(workspace, stringArg(payload, "path"))
	if err != nil {
		return fileMutation{}, err
	}
	content := stringArg(payload, "content")
	if len(content) > maxTextBytes {
		return fileMutation{}, errors.New("content is larger than 2 MiB")
	}
	previous, readErr := os.ReadFile(target)
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		return fileMutation{}, readErr
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fileMutation{}, err
	}
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return fileMutation{}, err
	}
	added, removed := lineDiff(string(previous), content)
	return fileMutation{Path: target, Size: len(content), Added: added, Removed: removed}, nil
}

func actionReplaceText(workspace string, payload map[string]interface{}) (fileMutation, error) {
	target, err := actionPath(workspace, stringArg(payload, "path"))
	if err != nil {
		return fileMutation{}, err
	}
	oldText := stringArg(payload, "old_text")
	if oldText == "" {
		return fileMutation{}, errors.New("old_text is required")
	}
	current, err := os.ReadFile(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileMutation{}, fmt.Errorf("file not found: %s", target)
		}
		return fileMutation{}, err
	}
	pieces := strings.Split(string(current), oldText)
	if len(pieces) == 1 {
		return fileMutation{Path: target}, nil
	}
	next := strings.Join(pieces, stringArg(payload, "new_text"))
	if len(next) > maxTextBytes {
		return fileMutation{}, errors.New("content is larger than 2 MiB")
	}
	if err := os.WriteFile(target, []byte(next), 0o644); err != nil {
		return fileMutation{}, err
	}
	added, removed := lineDiff(string(current), next)
	return fileMutation{Path: target, Replacements: len(pieces) - 1, Added: added, Removed: removed}, nil
}

type fileDigest struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

func actionFileSHA256(workspace string, payload map[string]interface{}) (fileDigest, error) {
	target, err := actionPath(workspace, stringArg(payload, "path"))
	if err != nil {
		return fileDigest{}, err
	}
	info, err := os.Stat(target)
	if err != nil || info.IsDir() {
		return fileDigest{}, fmt.Errorf("file not found: %s", target)
	}
	content, err := os.ReadFile(target)
	if err != nil {
		return fileDigest{}, err
	}
	return fileDigest{Path: target, SHA256: sha256String(string(content)), Size: info.Size()}, nil
}

// lineDiff counts the lines an edit added and removed, mirroring the built-in
// connector: the untouched head and tail are trimmed first (where nearly all of
// the saving is), the remainders are aligned with a longest-common-subsequence
// walk, and a very large changed region falls back to a wholesale replacement.
func lineDiff(before string, after string) (int, int) {
	if before == after {
		return 0, 0
	}
	var left, right []string
	if before != "" {
		left = strings.Split(before, "\n")
	}
	if after != "" {
		right = strings.Split(after, "\n")
	}
	head := 0
	for head < len(left) && head < len(right) && left[head] == right[head] {
		head++
	}
	tail := 0
	for tail < len(left)-head && tail < len(right)-head && left[len(left)-1-tail] == right[len(right)-1-tail] {
		tail++
	}
	a := left[head : len(left)-tail]
	b := right[head : len(right)-tail]
	if len(a) == 0 {
		return len(b), 0
	}
	if len(b) == 0 {
		return 0, len(a)
	}
	if len(a)*len(b) > 4_000_000 {
		return len(b), len(a)
	}
	next := make([]uint32, len(b)+1)
	rows := make([][]uint32, len(a))
	for index := range rows {
		rows[index] = make([]uint32, len(b)+1)
	}
	for i := len(a) - 1; i >= 0; i-- {
		row := rows[i]
		for j := len(b) - 1; j >= 0; j-- {
			if a[i] == b[j] {
				row[j] = next[j+1] + 1
			} else if next[j] > row[j+1] {
				row[j] = next[j]
			} else {
				row[j] = row[j+1]
			}
		}
		next = row
	}
	common := int(rows[0][0])
	return len(b) - common, len(a) - common
}
