package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (client connectorClient) workspaceRoot(path string) (string, error) {
	return validateWorkspaceRoot(path)
}

func validateWorkspaceRoot(path string) (string, error) {
	raw := strings.TrimSpace(path)
	if raw == "" {
		return "", errors.New("workspace path is required")
	}
	if !filepath.IsAbs(raw) {
		return "", errors.New("workspace path must be absolute")
	}
	workspace := cleanAbs(raw)
	info, err := os.Stat(workspace)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a directory", workspace)
	}
	return workspace, nil
}

func resolveWorkspacePath(workspace string, relPath string) (string, error) {
	workspace = strings.TrimSpace(workspace)
	relPath = strings.TrimSpace(relPath)
	if workspace == "" {
		if relPath == "" {
			return "", errors.New("absolute path is required when no workspace is selected")
		}
		if !filepath.IsAbs(relPath) {
			return "", errors.New("path must be absolute when no workspace is selected")
		}
		return cleanAbs(relPath), nil
	}
	workspace = cleanAbs(workspace)
	if filepath.IsAbs(relPath) {
		return "", errors.New("path must be relative to the workspace")
	}
	target := filepath.Clean(filepath.Join(workspace, relPath))
	relative, err := filepath.Rel(workspace, target)
	if err != nil {
		return "", err
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", errors.New("path escapes the workspace")
	}
	return target, nil
}

func cleanAbs(path string) string {
	abs, err := filepath.Abs(strings.TrimSpace(path))
	if err != nil {
		return filepath.Clean(strings.TrimSpace(path))
	}
	return filepath.Clean(abs)
}

func hostname() string {
	value, _ := os.Hostname()
	return value
}
