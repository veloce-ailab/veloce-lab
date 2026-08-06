package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func listFiles(workspace string, relPath string, maxEntries int) (string, error) {
	if maxEntries <= 0 || maxEntries > 500 {
		maxEntries = 100
	}
	target, err := resolveWorkspacePath(workspace, relPath)
	if err != nil {
		return "", err
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return "", err
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir() != entries[j].IsDir() {
			return entries[i].IsDir()
		}
		return strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
	})
	var lines []string
	for index, entry := range entries {
		if index >= maxEntries {
			lines = append(lines, fmt.Sprintf("... %d more entries", len(entries)-index))
			break
		}
		info, _ := entry.Info()
		kind := "file"
		size := int64(0)
		if entry.IsDir() {
			kind = "dir"
		} else if info != nil {
			size = info.Size()
		}
		lines = append(lines, fmt.Sprintf("%s\t%s\t%d", kind, entry.Name(), size))
	}
	return strings.Join(lines, "\n"), nil
}

func readFile(workspace string, relPath string, maxBytes int) (string, error) {
	if maxBytes <= 0 || maxBytes > 200000 {
		maxBytes = 120000
	}
	target, err := resolveWorkspacePath(workspace, relPath)
	if err != nil {
		return "", err
	}
	file, err := os.Open(target)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, int64(maxBytes)+1))
	if err != nil {
		return "", err
	}
	text := string(data)
	if len(data) > maxBytes {
		text = string(data[:maxBytes]) + "\n...(truncated)"
	}
	return text, nil
}

func fileSHA256(workspace string, relPath string) (string, error) {
	if relPath == "" {
		return "", errors.New("path is required")
	}
	target, err := resolveWorkspacePath(workspace, relPath)
	if err != nil {
		return "", err
	}
	file, err := os.Open(target)
	if errors.Is(err, os.ErrNotExist) {
		return sha256String(""), nil
	}
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeFile(workspace string, relPath string, content string, overwrite bool, createDirs bool) (string, error) {
	if relPath == "" {
		return "", errors.New("path is required")
	}
	target, err := resolveWorkspacePath(workspace, relPath)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(target); err == nil && !overwrite {
		return "", errors.New("file exists and overwrite is false")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if createDirs {
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", err
		}
	}
	if err := os.WriteFile(target, []byte(content), 0644); err != nil {
		return "", err
	}
	return fmt.Sprintf("Wrote %d bytes to %s", len(content), relPath), nil
}

func replaceText(workspace string, relPath string, oldText string, newText string) (string, error) {
	if relPath == "" {
		return "", errors.New("path is required")
	}
	if oldText == "" {
		return "", errors.New("old_text is required")
	}
	target, err := resolveWorkspacePath(workspace, relPath)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return "", err
	}
	current := string(data)
	count := strings.Count(current, oldText)
	if count == 0 {
		return "", errors.New("old_text was not found")
	}
	if count > 1 {
		return "", fmt.Errorf("old_text matched %d occurrences; refine old_text so it matches exactly one location", count)
	}
	next := strings.Replace(current, oldText, newText, 1)
	if err := os.WriteFile(target, []byte(next), 0644); err != nil {
		return "", err
	}
	return fmt.Sprintf("Replaced 1 occurrence in %s", relPath), nil
}
