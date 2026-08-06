package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	agentGroupsRoot         = ".agent-groups"
	agentGroupsMaxFiles     = 100
	agentGroupsMaxFileBytes = 256 * 1024
)

var agentGroupIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

type agentGroupEnvelope struct {
	Groups []json.RawMessage `json:"groups"`
}

func listAgentGroups() (string, error) {
	root := globalAgentGroupsRoot()
	if root == "" {
		return marshalAgentGroupsEnvelope(agentGroupEnvelope{})
	}
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return marshalAgentGroupsEnvelope(agentGroupEnvelope{})
	}
	if err != nil {
		return "", err
	}
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
	})
	groups := make([]json.RawMessage, 0, len(entries))
	for _, entry := range entries {
		if len(groups) >= agentGroupsMaxFiles {
			break
		}
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		if !validAgentGroupID(id) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(root, entry.Name()))
		if err != nil || len(data) > agentGroupsMaxFileBytes || !json.Valid(data) {
			continue
		}
		groups = append(groups, json.RawMessage(data))
	}
	return marshalAgentGroupsEnvelope(agentGroupEnvelope{Groups: groups})
}

func readAgentGroup(id string) (string, error) {
	path, err := agentGroupPath(id)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if len(data) > agentGroupsMaxFileBytes {
		return "", errors.New("agent group file is too large")
	}
	if !json.Valid(data) {
		return "", errors.New("agent group file is not valid JSON")
	}
	return string(data), nil
}

func writeAgentGroup(id string, content string) (string, error) {
	id = strings.TrimSpace(id)
	if !validAgentGroupID(id) {
		return "", errors.New("agent group id must be 1-80 characters of letters, numbers, underscore, or dash")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return "", errors.New("content is required")
	}
	if len([]byte(content)) > agentGroupsMaxFileBytes {
		return "", errors.New("agent group content is too large")
	}
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(content), &payload); err != nil {
		return "", fmt.Errorf("agent group content must be JSON: %w", err)
	}
	payload["id"] = id
	payload["updated_at"] = time.Now().UTC().Format(time.RFC3339)
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	path, err := agentGroupPath(id)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", err
	}
	return fmt.Sprintf("Saved agent group %s", id), nil
}

func deleteAgentGroup(id string) (string, error) {
	path, err := agentGroupPath(id)
	if err != nil {
		return "", err
	}
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", errors.New("agent group not found")
		}
		return "", err
	}
	return fmt.Sprintf("Deleted agent group %s", strings.TrimSpace(id)), nil
}

func agentGroupPath(id string) (string, error) {
	id = strings.TrimSpace(id)
	if !validAgentGroupID(id) {
		return "", errors.New("invalid agent group id")
	}
	root := globalAgentGroupsRoot()
	if root == "" {
		return "", errors.New("user home directory is unavailable")
	}
	return filepath.Join(root, id+".json"), nil
}

func validAgentGroupID(id string) bool {
	return agentGroupIDPattern.MatchString(strings.TrimSpace(id))
}

func globalAgentGroupsRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return ""
	}
	return filepath.Join(home, "veloce", agentGroupsRoot)
}

func marshalAgentGroupsEnvelope(envelope agentGroupEnvelope) (string, error) {
	if envelope.Groups == nil {
		envelope.Groups = []json.RawMessage{}
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
