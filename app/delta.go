package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const maxCommitDeltaMutations = 200

var emptySHA256 = sha256String("")

type commitDeltaMutation struct {
	Action     string `json:"action"`
	Path       string `json:"path"`
	Content    string `json:"content"`
	OldText    string `json:"old_text"`
	NewText    string `json:"new_text"`
	Overwrite  *bool  `json:"overwrite"`
	CreateDirs *bool  `json:"create_dirs"`
	BaseSHA256 string `json:"base_sha256"`
}

type stagedCommitFile struct {
	relPath         string
	target          string
	content         string
	initialContent  string
	initialExists   bool
	finalExists     bool
	mode            os.FileMode
	allowCreateDirs bool
}

type commitReplacement struct {
	target  string
	temp    string
	backup  string
	existed bool
}

func commitDelta(workspace string, payload map[string]interface{}) (string, error) {
	mutations, err := commitDeltaMutations(payload)
	if err != nil {
		return "", err
	}
	if len(mutations) == 0 {
		return "", errors.New("mutations are required")
	}

	staged := map[string]*stagedCommitFile{}
	order := make([]string, 0)
	for index, mutation := range mutations {
		target, err := resolveWorkspacePath(workspace, mutation.Path)
		if err != nil {
			return "", fmt.Errorf("mutation %d: %w", index+1, err)
		}
		file, err := stagedCommitFileFor(staged, &order, mutation.Path, target)
		if err != nil {
			return "", fmt.Errorf("mutation %d: %w", index+1, err)
		}
		if err := verifyCommitDeltaBaseSHA(file, mutation.BaseSHA256); err != nil {
			return "", fmt.Errorf("mutation %d: %w", index+1, err)
		}

		switch strings.TrimSpace(mutation.Action) {
		case "write_file":
			overwrite := mutation.Overwrite != nil && *mutation.Overwrite
			if file.finalExists && !overwrite {
				return "", fmt.Errorf("mutation %d: file exists and overwrite is false: %s", index+1, mutation.Path)
			}
			if mutation.CreateDirs != nil && *mutation.CreateDirs {
				file.allowCreateDirs = true
			}
			file.content = mutation.Content
			file.finalExists = true
		case "replace_text":
			if !file.finalExists {
				return "", fmt.Errorf("mutation %d: file does not exist: %s", index+1, mutation.Path)
			}
			if mutation.OldText == "" {
				return "", fmt.Errorf("mutation %d: old_text is required", index+1)
			}
			count := strings.Count(file.content, mutation.OldText)
			if count == 0 {
				return "", fmt.Errorf("mutation %d: old_text was not found in %s", index+1, mutation.Path)
			}
			if count > 1 {
				return "", fmt.Errorf("mutation %d: old_text matched %d occurrences in %s; refine old_text so it matches exactly one location", index+1, count, mutation.Path)
			}
			file.content = strings.Replace(file.content, mutation.OldText, mutation.NewText, 1)
			file.finalExists = true
		case "delete_file":
			if !file.finalExists {
				return "", fmt.Errorf("mutation %d: file does not exist: %s", index+1, mutation.Path)
			}
			file.content = ""
			file.finalExists = false
		default:
			return "", fmt.Errorf("mutation %d: unsupported action %q", index+1, mutation.Action)
		}
	}

	files := make([]*stagedCommitFile, 0, len(order))
	for _, target := range order {
		files = append(files, staged[target])
	}
	if err := preflightCommitDelta(files); err != nil {
		return "", err
	}
	if err := applyCommitDelta(files); err != nil {
		return "", err
	}
	return fmt.Sprintf("Committed %d mutation(s) across %d file(s).", len(mutations), len(files)), nil
}

func commitDeltaMutations(payload map[string]interface{}) ([]commitDeltaMutation, error) {
	raw, ok := payload["mutations"]
	if !ok {
		return nil, nil
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var mutations []commitDeltaMutation
	if err := json.Unmarshal(data, &mutations); err != nil {
		return nil, err
	}
	if len(mutations) > maxCommitDeltaMutations {
		return nil, fmt.Errorf("too many mutations: max %d", maxCommitDeltaMutations)
	}
	result := make([]commitDeltaMutation, 0, len(mutations))
	for _, mutation := range mutations {
		mutation.Action = strings.TrimSpace(mutation.Action)
		mutation.Path = strings.TrimSpace(mutation.Path)
		mutation.BaseSHA256 = strings.ToLower(strings.TrimSpace(mutation.BaseSHA256))
		if mutation.Action == "" || mutation.Path == "" {
			continue
		}
		result = append(result, mutation)
	}
	return result, nil
}

func stagedCommitFileFor(staged map[string]*stagedCommitFile, order *[]string, relPath string, target string) (*stagedCommitFile, error) {
	if file := staged[target]; file != nil {
		return file, nil
	}
	file := &stagedCommitFile{
		relPath: strings.TrimSpace(relPath),
		target:  target,
		mode:    0644,
	}
	data, err := os.ReadFile(target)
	if err == nil {
		file.initialExists = true
		file.finalExists = true
		file.content = string(data)
		file.initialContent = file.content
		if info, statErr := os.Stat(target); statErr == nil {
			file.mode = info.Mode().Perm()
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	staged[target] = file
	*order = append(*order, target)
	return file, nil
}

func verifyCommitDeltaBaseSHA(file *stagedCommitFile, expected string) error {
	expected = strings.ToLower(strings.TrimSpace(expected))
	if expected == "" || expected == emptySHA256 {
		return nil
	}
	actual := sha256String(file.initialContent)
	if actual != expected {
		return fmt.Errorf("base_sha256 mismatch for %s", file.relPath)
	}
	return nil
}

func preflightCommitDelta(files []*stagedCommitFile) error {
	for _, file := range files {
		if !file.finalExists {
			if !file.initialExists {
				continue
			}
			data, err := os.ReadFile(file.target)
			if err != nil {
				return fmt.Errorf("failed to re-read %s before commit: %w", file.relPath, err)
			}
			if sha256String(string(data)) != sha256String(file.initialContent) {
				return fmt.Errorf("file changed before commit: %s", file.relPath)
			}
			continue
		}
		if file.initialExists {
			data, err := os.ReadFile(file.target)
			if err != nil {
				return fmt.Errorf("failed to re-read %s before commit: %w", file.relPath, err)
			}
			if sha256String(string(data)) != sha256String(file.initialContent) {
				return fmt.Errorf("file changed before commit: %s", file.relPath)
			}
			continue
		}
		if _, err := os.Stat(file.target); err == nil {
			return fmt.Errorf("file appeared before commit: %s", file.relPath)
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		parent := filepath.Dir(file.target)
		if _, err := os.Stat(parent); err != nil {
			if errors.Is(err, os.ErrNotExist) && file.allowCreateDirs {
				continue
			}
			return fmt.Errorf("parent directory is not available for %s: %w", file.relPath, err)
		}
	}
	return nil
}

func applyCommitDelta(files []*stagedCommitFile) error {
	replacements := make([]commitReplacement, 0, len(files))
	for _, file := range files {
		if !file.finalExists {
			if file.initialExists {
				replacements = append(replacements, commitReplacement{target: file.target, existed: true})
			}
			continue
		}
		if file.allowCreateDirs {
			if err := os.MkdirAll(filepath.Dir(file.target), 0755); err != nil {
				cleanupCommitDeltaTemps(replacements)
				return err
			}
		}
		temp, err := writeCommitDeltaTemp(file)
		if err != nil {
			cleanupCommitDeltaTemps(replacements)
			return err
		}
		replacements = append(replacements, commitReplacement{target: file.target, temp: temp, existed: file.initialExists})
	}

	applied := make([]commitReplacement, 0, len(replacements))
	for _, replacement := range replacements {
		if replacement.existed {
			backup, err := backupCommitDeltaTarget(replacement.target)
			if err != nil {
				cleanupCommitDeltaTemps(replacements)
				rollbackCommitDelta(applied)
				return err
			}
			replacement.backup = backup
		}
		if replacement.temp == "" {
			applied = append(applied, replacement)
			continue
		}
		if err := os.Rename(replacement.temp, replacement.target); err != nil {
			if replacement.backup != "" {
				_ = os.Rename(replacement.backup, replacement.target)
			}
			cleanupCommitDeltaTemps(replacements)
			rollbackCommitDelta(applied)
			return err
		}
		applied = append(applied, replacement)
	}
	for _, replacement := range applied {
		if replacement.backup != "" {
			_ = os.Remove(replacement.backup)
		}
	}
	return nil
}

func writeCommitDeltaTemp(file *stagedCommitFile) (string, error) {
	temp, err := os.CreateTemp(filepath.Dir(file.target), ".commit-delta-*")
	if err != nil {
		return "", err
	}
	tempName := temp.Name()
	if _, err := temp.WriteString(file.content); err != nil {
		_ = temp.Close()
		_ = os.Remove(tempName)
		return "", err
	}
	if err := temp.Close(); err != nil {
		_ = os.Remove(tempName)
		return "", err
	}
	if err := os.Chmod(tempName, file.mode); err != nil {
		_ = os.Remove(tempName)
		return "", err
	}
	return tempName, nil
}

func backupCommitDeltaTarget(target string) (string, error) {
	backup := fmt.Sprintf("%s.commit-delta-backup-%d", target, os.Getpid())
	if _, err := os.Stat(backup); err == nil {
		return "", fmt.Errorf("backup path already exists: %s", backup)
	}
	if err := os.Rename(target, backup); err != nil {
		return "", err
	}
	return backup, nil
}

func rollbackCommitDelta(applied []commitReplacement) {
	for index := len(applied) - 1; index >= 0; index-- {
		replacement := applied[index]
		if replacement.existed {
			_ = os.Remove(replacement.target)
			if replacement.backup != "" {
				_ = os.Rename(replacement.backup, replacement.target)
			}
			continue
		}
		_ = os.Remove(replacement.target)
	}
}

func cleanupCommitDeltaTemps(replacements []commitReplacement) {
	for _, replacement := range replacements {
		if replacement.temp != "" {
			_ = os.Remove(replacement.temp)
		}
	}
}

func sha256String(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
