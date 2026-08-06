package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	agentSkillsRoot          = ".agents"
	agentSkillsMaxDepth      = 4
	agentSkillsMaxFiles      = 40
	agentSkillsMaxFileBytes  = 64 * 1024
	agentSkillsMaxTotalBytes = 256 * 1024
)

type agentSkillsEnvelope struct {
	Skills         []agentSkill `json:"skills"`
	Truncated      bool         `json:"truncated"`
	MaxFiles       int          `json:"max_files"`
	MaxFileBytes   int          `json:"max_file_bytes"`
	MaxTotalBytes  int          `json:"max_total_bytes"`
	TotalBytesRead int          `json:"total_bytes_read"`
}

type agentSkill struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Path        string   `json:"path"`
	Content     string   `json:"content,omitempty"`
	Resources   []string `json:"resource_paths,omitempty"`
	Size        int      `json:"size"`
	Truncated   bool     `json:"truncated"`
}

type agentSkillSource struct {
	Root        string
	DisplayRoot string
	Label       string
}

type agentSkillFile struct {
	Path        string
	DisplayPath string
	ID          string
	Name        string
	Description string
	Resources   []string
	Root        string
}

type syncedAgentSkillManifest struct {
	Packages []syncedAgentSkillPackage `json:"packages"`
}

type syncedAgentSkillPackage struct {
	ID     string                  `json:"id"`
	Hash   string                  `json:"hash"`
	Skills []syncedAgentSkillEntry `json:"skills"`
}

type syncedAgentSkillEntry struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	SkillPath   string   `json:"skill_path"`
	RootPath    string   `json:"root_path"`
	Resources   []string `json:"resource_paths"`
}

func listAgentSkills(workspace string) (string, error) {
	sources := []agentSkillSource{}
	workspace = strings.TrimSpace(workspace)
	if workspace != "" {
		root, err := validateWorkspaceRoot(workspace)
		if err != nil {
			return "", err
		}
		sources = append(sources, agentSkillSource{
			Root:        filepath.Join(root, agentSkillsRoot),
			DisplayRoot: ".agents",
			Label:       ".agents",
		})
	}
	if globalRoot := globalAgentSkillsRoot(); globalRoot != "" {
		sources = append(sources, agentSkillSource{
			Root:        globalRoot,
			DisplayRoot: ".agents/global",
			Label:       "global .agents",
		})
	}

	paths := []agentSkillFile{}
	envelope := agentSkillsEnvelope{
		Skills:        []agentSkill{},
		MaxFiles:      agentSkillsMaxFiles,
		MaxFileBytes:  agentSkillsMaxFileBytes,
		MaxTotalBytes: agentSkillsMaxTotalBytes,
	}
	for _, source := range sources {
		if len(paths) >= agentSkillsMaxFiles {
			envelope.Truncated = true
			break
		}
		collected, truncated, err := collectAgentSkillFiles(source, agentSkillsMaxFiles-len(paths))
		if err != nil {
			return "", err
		}
		if truncated {
			envelope.Truncated = true
		}
		paths = append(paths, collected...)
	}
	if len(paths) < agentSkillsMaxFiles {
		collected, truncated, err := collectSyncedAgentSkillFiles(agentSkillsMaxFiles - len(paths))
		if err != nil {
			return "", err
		}
		if truncated {
			envelope.Truncated = true
		}
		paths = append(paths, collected...)
	}
	if len(paths) == 0 {
		return marshalAgentSkillsEnvelope(envelope)
	}
	sort.Slice(paths, func(i, j int) bool {
		return strings.ToLower(paths[i].DisplayPath) < strings.ToLower(paths[j].DisplayPath)
	})

	for _, item := range paths {
		info, err := os.Stat(item.Path)
		if err != nil || info.IsDir() {
			continue
		}
		description, name := item.Description, item.Name
		if strings.TrimSpace(description) == "" || strings.TrimSpace(name) == "" {
			fileDescription, fileName := readAgentSkillDirectoryMetadata(item.Path)
			if strings.TrimSpace(description) == "" {
				description = fileDescription
			}
			if strings.TrimSpace(name) == "" {
				name = fileName
			}
		}
		if strings.TrimSpace(name) == "" {
			name = skillNameFromPath(item.DisplayPath)
		}
		id := item.ID
		if strings.TrimSpace(id) == "" {
			id = skillIDFromPath(item.DisplayPath)
		}
		resources := item.Resources
		if resources == nil {
			resources = listAgentSkillResources(firstNonEmpty(item.Root, filepath.Dir(item.Path)))
		}
		envelope.Skills = append(envelope.Skills, agentSkill{
			ID:          id,
			Name:        name,
			Description: description,
			Path:        item.DisplayPath,
			Resources:   resources,
			Size:        int(info.Size()),
		})
	}
	return marshalAgentSkillsEnvelope(envelope)
}

func readAgentSkill(workspace string, id string, displayPath string, maxBytes int) (string, error) {
	item, err := findAgentSkillFile(workspace, id, displayPath)
	if err != nil {
		return "", err
	}
	if maxBytes <= 0 || maxBytes > agentSkillsMaxFileBytes {
		maxBytes = agentSkillsMaxFileBytes
	}
	file, err := os.Open(item.Path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, int64(maxBytes)+1))
	if err != nil {
		return "", err
	}
	truncated := len(data) > maxBytes
	if truncated {
		data = data[:maxBytes]
	}
	response := agentSkill{
		ID:          firstNonEmpty(item.ID, skillIDFromPath(item.DisplayPath)),
		Name:        firstNonEmpty(item.Name, skillNameFromPath(item.DisplayPath)),
		Description: item.Description,
		Path:        item.DisplayPath,
		Content:     strings.TrimSpace(string(data)),
		Resources:   firstNonNilStrings(item.Resources, listAgentSkillResources(firstNonEmpty(item.Root, filepath.Dir(item.Path)))),
		Size:        len(data),
		Truncated:   truncated,
	}
	if description, name := readAgentSkillDirectoryMetadata(item.Path); (strings.TrimSpace(description) != "" || strings.TrimSpace(name) != "") && strings.TrimSpace(item.Description) == "" {
		response.Description = description
		if strings.TrimSpace(name) != "" {
			response.Name = name
		}
	}
	payload, err := json.Marshal(response)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

func findAgentSkillFile(workspace string, id string, displayPath string) (agentSkillFile, error) {
	sources, err := agentSkillSources(workspace)
	if err != nil {
		return agentSkillFile{}, err
	}
	id = strings.TrimSpace(id)
	displayPath = strings.TrimSpace(strings.ReplaceAll(displayPath, "\\", "/"))
	for _, source := range sources {
		files, _, err := collectAgentSkillFiles(source, agentSkillsMaxFiles)
		if err != nil {
			return agentSkillFile{}, err
		}
		for _, file := range files {
			if id != "" && skillIDFromPath(file.DisplayPath) == id {
				return file, nil
			}
			if displayPath != "" && file.DisplayPath == displayPath {
				return file, nil
			}
		}
	}
	files, _, err := collectSyncedAgentSkillFiles(agentSkillsMaxFiles)
	if err != nil {
		return agentSkillFile{}, err
	}
	for _, file := range files {
		if id != "" && file.ID == id {
			return file, nil
		}
		if displayPath != "" && file.DisplayPath == displayPath {
			return file, nil
		}
	}
	return agentSkillFile{}, fmt.Errorf("agent skill not found")
}

func agentSkillSources(workspace string) ([]agentSkillSource, error) {
	sources := []agentSkillSource{}
	workspace = strings.TrimSpace(workspace)
	if workspace != "" {
		root, err := validateWorkspaceRoot(workspace)
		if err != nil {
			return nil, err
		}
		sources = append(sources, agentSkillSource{
			Root:        filepath.Join(root, agentSkillsRoot),
			DisplayRoot: ".agents",
			Label:       ".agents",
		})
	}
	if globalRoot := globalAgentSkillsRoot(); globalRoot != "" {
		sources = append(sources, agentSkillSource{
			Root:        globalRoot,
			DisplayRoot: ".agents/global",
			Label:       "global .agents",
		})
	}
	return sources, nil
}

func collectAgentSkillFiles(source agentSkillSource, remainingFiles int) ([]agentSkillFile, bool, error) {
	if remainingFiles <= 0 {
		return nil, true, nil
	}
	info, err := os.Stat(source.Root)
	if errors.Is(err, os.ErrNotExist) {
		return []agentSkillFile{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if !info.IsDir() {
		return nil, false, fmt.Errorf("%s is not a directory", source.Label)
	}

	paths := []agentSkillFile{}
	truncated := false
	err = filepath.WalkDir(source.Root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		rel, err := filepath.Rel(source.Root, path)
		if err != nil || rel == "." {
			return nil
		}
		depth := strings.Count(filepath.ToSlash(rel), "/") + 1
		if entry.IsDir() {
			if depth > agentSkillsMaxDepth || entry.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 || !isAgentSkillMarkdown(entry.Name()) {
			return nil
		}
		if depth > agentSkillsMaxDepth {
			return nil
		}
		if len(paths) >= remainingFiles {
			truncated = true
			return filepath.SkipAll
		}
		displayPath := strings.TrimRight(source.DisplayRoot, "/") + "/" + filepath.ToSlash(rel)
		paths = append(paths, agentSkillFile{Path: path, DisplayPath: displayPath})
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return paths, truncated, nil
}

func syncAgentSkills(payload map[string]interface{}) (string, error) {
	var input struct {
		Packages []struct {
			ID    string `json:"id"`
			Hash  string `json:"hash"`
			Files []struct {
				Path    string `json:"path"`
				Content string `json:"content"`
			} `json:"files"`
			Skills []syncedAgentSkillEntry `json:"skills"`
		} `json:"packages"`
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	if err := json.Unmarshal(data, &input); err != nil {
		return "", err
	}
	root := syncedAgentSkillsRoot()
	if root == "" {
		return "", errors.New("connector data directory is unavailable")
	}
	if err := os.MkdirAll(filepath.Dir(root), 0755); err != nil {
		return "", err
	}
	tmp, err := os.MkdirTemp(filepath.Dir(root), ".agent-skills-*")
	if err != nil {
		return "", err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(tmp)
		}
	}()

	manifest := syncedAgentSkillManifest{Packages: []syncedAgentSkillPackage{}}
	for _, pkg := range input.Packages {
		packageID, err := normalizeSyncedAgentSkillToken(pkg.ID)
		if err != nil {
			return "", fmt.Errorf("invalid skill package id: %w", err)
		}
		hash, err := normalizeSyncedAgentSkillToken(pkg.Hash)
		if err != nil {
			return "", fmt.Errorf("invalid skill package hash: %w", err)
		}
		packageRoot := filepath.Join(tmp, "packages", packageID, hash)
		filesRoot := filepath.Join(packageRoot, "files")
		for _, file := range pkg.Files {
			relativePath, err := normalizeAgentSkillRelativePath(file.Path)
			if err != nil {
				return "", err
			}
			decoded, err := base64.StdEncoding.DecodeString(file.Content)
			if err != nil {
				return "", fmt.Errorf("skill file %s content must be base64", relativePath)
			}
			if len(decoded) > agentSkillsMaxFileBytes*32 {
				return "", fmt.Errorf("skill file %s is too large", relativePath)
			}
			target := filepath.Join(filesRoot, filepath.FromSlash(relativePath))
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return "", err
			}
			if err := os.WriteFile(target, decoded, 0644); err != nil {
				return "", err
			}
		}
		skills := make([]syncedAgentSkillEntry, 0, len(pkg.Skills))
		for _, skill := range pkg.Skills {
			if strings.TrimSpace(skill.ID) == "" {
				continue
			}
			skillPath, err := normalizeAgentSkillRelativePath(skill.SkillPath)
			if err != nil {
				return "", err
			}
			rootPath := ""
			if strings.TrimSpace(skill.RootPath) != "" {
				rootPath, err = normalizeAgentSkillRelativePath(skill.RootPath)
				if err != nil {
					return "", err
				}
			}
			resources := make([]string, 0, len(skill.Resources))
			for _, resource := range skill.Resources {
				resourcePath, err := normalizeAgentSkillRelativePath(resource)
				if err != nil {
					continue
				}
				resources = append(resources, resourcePath)
			}
			skill.SkillPath = skillPath
			skill.RootPath = rootPath
			skill.Resources = resources
			skills = append(skills, skill)
		}
		manifest.Packages = append(manifest.Packages, syncedAgentSkillPackage{
			ID:     packageID,
			Hash:   hash,
			Skills: skills,
		})
	}
	manifestData, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(tmp, "manifest.json"), manifestData, 0644); err != nil {
		return "", err
	}
	backup := root + ".bak"
	_ = os.RemoveAll(backup)
	if _, err := os.Stat(root); err == nil {
		if err := os.Rename(root, backup); err != nil {
			return "", err
		}
	}
	if err := os.Rename(tmp, root); err != nil {
		if _, statErr := os.Stat(backup); statErr == nil {
			_ = os.Rename(backup, root)
		}
		return "", err
	}
	_ = os.RemoveAll(backup)
	cleanup = false
	return fmt.Sprintf("synced %d skill packages", len(manifest.Packages)), nil
}

func collectSyncedAgentSkillFiles(remainingFiles int) ([]agentSkillFile, bool, error) {
	if remainingFiles <= 0 {
		return nil, true, nil
	}
	root := syncedAgentSkillsRoot()
	if root == "" {
		return []agentSkillFile{}, false, nil
	}
	data, err := os.ReadFile(filepath.Join(root, "manifest.json"))
	if errors.Is(err, os.ErrNotExist) {
		return []agentSkillFile{}, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	var manifest syncedAgentSkillManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, false, err
	}
	files := []agentSkillFile{}
	truncated := false
	for _, pkg := range manifest.Packages {
		if len(files) >= remainingFiles {
			truncated = true
			break
		}
		packageID, err := normalizeSyncedAgentSkillToken(pkg.ID)
		if err != nil {
			continue
		}
		hash, err := normalizeSyncedAgentSkillToken(pkg.Hash)
		if err != nil {
			continue
		}
		filesRoot := filepath.Join(root, "packages", packageID, hash, "files")
		for _, skill := range pkg.Skills {
			if len(files) >= remainingFiles {
				truncated = true
				break
			}
			skillPath, err := normalizeAgentSkillRelativePath(skill.SkillPath)
			if err != nil {
				continue
			}
			target := filepath.Join(filesRoot, filepath.FromSlash(skillPath))
			if _, err := os.Stat(target); err != nil {
				continue
			}
			rootPath := strings.Trim(strings.TrimSpace(skill.RootPath), "/")
			skillRoot := filesRoot
			if rootPath != "" {
				skillRoot = filepath.Join(filesRoot, filepath.FromSlash(rootPath))
			} else {
				skillRoot = filepath.Dir(target)
			}
			files = append(files, agentSkillFile{
				Path:        target,
				DisplayPath: ".agents/remote/" + packageID + "/" + skillPath,
				ID:          strings.TrimSpace(skill.ID),
				Name:        strings.TrimSpace(skill.Name),
				Description: strings.TrimSpace(skill.Description),
				Resources:   sanitizeAgentSkillResourcePaths(skill.Resources),
				Root:        skillRoot,
			})
		}
	}
	return files, truncated, nil
}

func readAgentSkillResource(workspace string, id string, displayPath string, resource string, maxBytes int) (string, error) {
	item, err := findAgentSkillFile(workspace, id, displayPath)
	if err != nil {
		return "", err
	}
	relativePath, err := normalizeAgentSkillRelativePath(resource)
	if err != nil {
		return "", err
	}
	if strings.EqualFold(relativePath, "SKILL.md") {
		return "", errors.New("use read_agent_skill to read SKILL.md")
	}
	root := item.Root
	if root == "" {
		root = filepath.Dir(item.Path)
	}
	target := filepath.Join(root, filepath.FromSlash(relativePath))
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", errors.New("skill resource path escapes skill root")
	}
	if maxBytes <= 0 || maxBytes > agentSkillsMaxFileBytes {
		maxBytes = agentSkillsMaxFileBytes
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
	truncated := len(data) > maxBytes
	if truncated {
		data = data[:maxBytes]
	}
	content := strings.TrimSpace(string(data))
	if truncated {
		content += "\n...(truncated)"
	}
	return fmt.Sprintf("<skill_resource skill_id=%q path=%q>\n%s\n</skill_resource>", firstNonEmpty(item.ID, id), relativePath, content), nil
}

func globalAgentSkillsRoot() string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return ""
	}
	return filepath.Join(home, "veloce", agentSkillsRoot)
}

func syncedAgentSkillsRoot() string {
	return filepath.Join(defaultConnectorDataDir(), "agent-skills", "remote")
}

func isAgentSkillMarkdown(name string) bool {
	return strings.EqualFold(filepath.Ext(name), ".md")
}

func skillIDFromPath(path string) string {
	id := strings.Trim(strings.ToLower(path), "/")
	id = strings.TrimPrefix(id, ".agents/")
	id = strings.TrimSuffix(id, ".md")
	id = strings.ReplaceAll(id, "/", "__")
	id = strings.ReplaceAll(id, "\\", "__")
	return id
}

func skillNameFromPath(path string) string {
	parts := strings.Split(filepath.ToSlash(path), "/")
	if len(parts) >= 3 && strings.EqualFold(parts[len(parts)-1], "skill.md") {
		return parts[len(parts)-2]
	}
	name := strings.TrimSuffix(parts[len(parts)-1], filepath.Ext(parts[len(parts)-1]))
	if strings.TrimSpace(name) == "" {
		return path
	}
	return name
}

func readAgentSkillDirectoryMetadata(path string) (string, string) {
	file, err := os.Open(path)
	if err != nil {
		return "", ""
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 16*1024))
	if err != nil {
		return "", ""
	}
	content := strings.TrimPrefix(string(data), "\ufeff")
	if !strings.HasPrefix(content, "---") {
		return "", ""
	}
	lines := strings.Split(content, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return "", ""
	}
	name := ""
	description := ""
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "---" {
			break
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "name":
			name = value
		case "description":
			description = value
		}
	}
	return description, name
}

func normalizeSyncedAgentSkillToken(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" || strings.ContainsAny(value, `/\:`) || strings.Contains(value, "..") || strings.Contains(value, "\x00") {
		return "", errors.New("invalid token")
	}
	return value, nil
}

func normalizeAgentSkillRelativePath(value string) (string, error) {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if value == "" || strings.HasPrefix(value, "/") || strings.Contains(value, "\x00") {
		return "", errors.New("invalid skill path")
	}
	parts := strings.Split(value, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("invalid skill path")
		}
	}
	return pathCleanSlash(value), nil
}

func sanitizeAgentSkillResourcePaths(paths []string) []string {
	result := make([]string, 0, len(paths))
	seen := map[string]bool{}
	for _, item := range paths {
		relativePath, err := normalizeAgentSkillRelativePath(item)
		if err != nil || strings.EqualFold(relativePath, "SKILL.md") || seen[relativePath] {
			continue
		}
		seen[relativePath] = true
		result = append(result, relativePath)
		if len(result) >= 100 {
			break
		}
	}
	return result
}

func listAgentSkillResources(root string) []string {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil
	}
	resources := []string{}
	_ = filepath.WalkDir(root, func(filePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || filePath == root {
			return nil
		}
		rel, err := filepath.Rel(root, filePath)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		depth := strings.Count(rel, "/") + 1
		if entry.IsDir() {
			if depth > agentSkillsMaxDepth || entry.Type()&os.ModeSymlink != 0 {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 || strings.EqualFold(rel, "SKILL.md") || depth > agentSkillsMaxDepth {
			return nil
		}
		resources = append(resources, rel)
		if len(resources) >= 100 {
			return filepath.SkipAll
		}
		return nil
	})
	sort.Strings(resources)
	return resources
}

func pathCleanSlash(value string) string {
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	return strings.TrimPrefix(cleaned, "./")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstNonNilStrings(values ...[]string) []string {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func marshalAgentSkillsEnvelope(envelope agentSkillsEnvelope) (string, error) {
	if envelope.Skills == nil {
		envelope.Skills = []agentSkill{}
	}
	if envelope.MaxFiles == 0 {
		envelope.MaxFiles = agentSkillsMaxFiles
	}
	if envelope.MaxFileBytes == 0 {
		envelope.MaxFileBytes = agentSkillsMaxFileBytes
	}
	if envelope.MaxTotalBytes == 0 {
		envelope.MaxTotalBytes = agentSkillsMaxTotalBytes
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
