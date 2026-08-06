package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	staticSiteMaxFiles      = 200
	staticSiteMaxFileBytes  = 2 * 1024 * 1024
	staticSiteMaxTotalBytes = 20 * 1024 * 1024
)

type staticSiteManager struct {
	root   string
	mu     sync.RWMutex
	routes map[string]staticSiteRoute
}

type staticSiteRoute struct {
	SiteID   string `json:"site_id"`
	Domain   string `json:"domain_name"`
	Enabled  bool   `json:"enabled"`
	Public   string `json:"public_dir"`
	Revision int64  `json:"revision"`
}

type staticSiteManifest struct {
	SiteID  string `json:"site_id"`
	Domain  string `json:"domain_name"`
	Enabled bool   `json:"enabled"`
}

type staticSiteFile struct {
	Path    string
	Content string
	Size    int
}

func newStaticSiteManager(dataDir string) (*staticSiteManager, error) {
	root := strings.TrimSpace(dataDir)
	if root == "" {
		root = defaultConnectorDataDir()
	}
	root = filepath.Join(cleanAbs(root), "sites")
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}
	manager := &staticSiteManager{
		root:   root,
		routes: map[string]staticSiteRoute{},
	}
	if err := manager.loadRoutes(); err != nil {
		return nil, err
	}
	return manager, nil
}

func defaultConnectorDataDir() string {
	if value := strings.TrimSpace(os.Getenv("VELOCE_APP_DATA")); value != "" {
		return value
	}
	if dir, err := os.UserConfigDir(); err == nil && strings.TrimSpace(dir) != "" {
		return filepath.Join(dir, "veloce-app")
	}
	return filepath.Join(".", "data")
}

func (manager *staticSiteManager) serve(port int) error {
	addr := fmt.Sprintf(":%d", port)
	server := &http.Server{
		Addr:    addr,
		Handler: http.HandlerFunc(manager.handle),
	}
	fmt.Printf("Static site server listening on %s, data root %s\n", addr, manager.root)
	return server.ListenAndServe()
}

func (manager *staticSiteManager) handle(w http.ResponseWriter, r *http.Request) {
	host := normalizeRequestHost(r.Host)
	if host == "" {
		http.Error(w, "host is required", http.StatusNotFound)
		return
	}
	manager.mu.RLock()
	route, ok := manager.routes[host]
	manager.mu.RUnlock()
	if !ok {
		http.Error(w, "site not found", http.StatusNotFound)
		return
	}
	if !route.Enabled {
		http.Error(w, "site suspended", http.StatusForbidden)
		return
	}
	relPath, err := cleanStaticRequestPath(r.URL.Path)
	if err != nil {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	target := filepath.Join(route.Public, filepath.FromSlash(relPath))
	if !pathInside(route.Public, target) {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	info, err := os.Stat(target)
	if err == nil && info.IsDir() {
		target = filepath.Join(target, "index.html")
	}
	if err != nil {
		http.NotFound(w, r)
		return
	}
	file, err := os.Open(target)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (manager *staticSiteManager) deploy(payload map[string]interface{}) (string, error) {
	siteID := strings.TrimSpace(stringArg(payload, "site_id"))
	domain, err := normalizeStaticSiteDomain(stringArg(payload, "domain_name"))
	if err != nil {
		return "", err
	}
	files, totalBytes, err := normalizeStaticSiteFiles(payload["files"])
	if err != nil {
		return "", err
	}
	enabled := true
	if value, ok := payload["enabled"].(bool); ok {
		enabled = value
	}
	siteRoot, err := manager.siteRoot(domain)
	if err != nil {
		return "", err
	}
	tmpDir, err := os.MkdirTemp(siteRoot, ".deploy-*")
	if err != nil {
		return "", err
	}
	cleanupTmp := true
	defer func() {
		if cleanupTmp {
			_ = os.RemoveAll(tmpDir)
		}
	}()
	for _, file := range files {
		target := filepath.Join(tmpDir, filepath.FromSlash(file.Path))
		if !pathInside(tmpDir, target) {
			return "", fmt.Errorf("file %s escapes deployment root", file.Path)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return "", err
		}
		decoded, err := base64.StdEncoding.DecodeString(file.Content)
		if err != nil {
			return "", fmt.Errorf("file %s content must be base64", file.Path)
		}
		if err := os.WriteFile(target, decoded, 0644); err != nil {
			return "", err
		}
	}
	publicDir := filepath.Join(siteRoot, "public")
	if err := replaceDirectory(publicDir, tmpDir); err != nil {
		return "", err
	}
	cleanupTmp = false
	route := staticSiteRoute{
		SiteID:   siteID,
		Domain:   domain,
		Enabled:  enabled,
		Public:   publicDir,
		Revision: nowUnix(),
	}
	if err := manager.writeManifest(siteRoot, route); err != nil {
		return "", err
	}
	manager.mu.Lock()
	manager.routes[domain] = route
	manager.mu.Unlock()
	return fmt.Sprintf("deployed static site %s (%s), %d files, %d bytes", domain, siteID, len(files), totalBytes), nil
}

func (manager *staticSiteManager) setEnabled(payload map[string]interface{}) (string, error) {
	domain, err := normalizeStaticSiteDomain(stringArg(payload, "domain_name"))
	if err != nil {
		return "", err
	}
	enabled, ok := payload["enabled"].(bool)
	if !ok {
		return "", errors.New("enabled is required")
	}
	siteRoot, err := manager.siteRoot(domain)
	if err != nil {
		return "", err
	}
	manager.mu.Lock()
	route, ok := manager.routes[domain]
	if !ok {
		route = staticSiteRoute{
			SiteID:  strings.TrimSpace(stringArg(payload, "site_id")),
			Domain:  domain,
			Public:  filepath.Join(siteRoot, "public"),
			Enabled: enabled,
		}
	} else {
		route.Enabled = enabled
	}
	manager.routes[domain] = route
	manager.mu.Unlock()
	if err := manager.writeManifest(siteRoot, route); err != nil {
		return "", err
	}
	state := "enabled"
	if !enabled {
		state = "suspended"
	}
	return fmt.Sprintf("static site %s is %s", domain, state), nil
}

func (manager *staticSiteManager) delete(payload map[string]interface{}) (string, error) {
	domain, err := normalizeStaticSiteDomain(stringArg(payload, "domain_name"))
	if err != nil {
		return "", err
	}
	siteRoot, err := manager.siteRoot(domain)
	if err != nil {
		return "", err
	}
	manager.mu.Lock()
	delete(manager.routes, domain)
	manager.mu.Unlock()
	if err := os.RemoveAll(siteRoot); err != nil {
		return "", err
	}
	return fmt.Sprintf("deleted static site %s", domain), nil
}

func (manager *staticSiteManager) loadRoutes() error {
	entries, err := os.ReadDir(manager.root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		siteRoot := filepath.Join(manager.root, entry.Name())
		manifestPath := filepath.Join(siteRoot, "site.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}
		var manifest staticSiteManifest
		if err := json.Unmarshal(data, &manifest); err != nil {
			continue
		}
		domain, err := normalizeStaticSiteDomain(manifest.Domain)
		if err != nil {
			continue
		}
		publicDir := filepath.Join(siteRoot, "public")
		manager.routes[domain] = staticSiteRoute{
			SiteID:  strings.TrimSpace(manifest.SiteID),
			Domain:  domain,
			Enabled: manifest.Enabled,
			Public:  publicDir,
		}
	}
	return nil
}

func (manager *staticSiteManager) writeManifest(siteRoot string, route staticSiteRoute) error {
	manifest := staticSiteManifest{
		SiteID:  route.SiteID,
		Domain:  route.Domain,
		Enabled: route.Enabled,
	}
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(siteRoot, "site.json"), data, 0644)
}

func (manager *staticSiteManager) siteRoot(domain string) (string, error) {
	domain, err := normalizeStaticSiteDomain(domain)
	if err != nil {
		return "", err
	}
	root := filepath.Join(manager.root, domain)
	if !pathInside(manager.root, root) {
		return "", errors.New("domain escapes sites root")
	}
	if err := os.MkdirAll(root, 0755); err != nil {
		return "", err
	}
	return root, nil
}

func normalizeRequestHost(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	} else if strings.Count(value, ":") == 1 {
		if before, _, ok := strings.Cut(value, ":"); ok {
			value = before
		}
	}
	value = strings.Trim(value, "[]")
	value = strings.TrimSuffix(value, ".")
	return value
}

func cleanStaticRequestPath(value string) (string, error) {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if value == "" || value == "/" {
		return "index.html", nil
	}
	if strings.Contains(value, "\x00") {
		return "", errors.New("invalid path")
	}
	cleaned := path.Clean("/" + value)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "." || cleaned == "" {
		return "index.html", nil
	}
	for _, part := range strings.Split(cleaned, "/") {
		if part == ".." {
			return "", errors.New("invalid path")
		}
	}
	return cleaned, nil
}

func normalizeStaticSiteDomain(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.TrimPrefix(value, "http://")
	value = strings.TrimPrefix(value, "https://")
	if slash := strings.Index(value, "/"); slash >= 0 {
		value = value[:slash]
	}
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	value = strings.Trim(value, "[]")
	value = strings.TrimSuffix(value, ".")
	if value == "" || len(value) > 253 {
		return "", errors.New("domain_name is invalid")
	}
	if strings.ContainsAny(value, " \t\r\n\\@:") || strings.Contains(value, "..") {
		return "", errors.New("domain_name must be a hostname without scheme, path, port, or credentials")
	}
	if value == "localhost" {
		return value, nil
	}
	labels := strings.Split(value, ".")
	if len(labels) < 2 {
		return "", errors.New("domain_name must contain at least two labels")
	}
	for _, label := range labels {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return "", errors.New("domain_name contains an invalid label")
		}
		for _, r := range label {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
				continue
			}
			return "", errors.New("domain_name may only contain letters, numbers, hyphens, and dots")
		}
	}
	return value, nil
}

func normalizeStaticSiteFiles(raw interface{}) ([]staticSiteFile, int, error) {
	items, ok := raw.([]interface{})
	if !ok || len(items) == 0 {
		return nil, 0, errors.New("files is required")
	}
	if len(items) > staticSiteMaxFiles {
		return nil, 0, fmt.Errorf("too many files: max %d", staticSiteMaxFiles)
	}
	files := make([]staticSiteFile, 0, len(items))
	seen := map[string]bool{}
	totalBytes := 0
	for _, item := range items {
		row, ok := item.(map[string]interface{})
		if !ok {
			return nil, 0, errors.New("files items must be objects")
		}
		relativePath, err := normalizeStaticSiteFilePath(stringArg(row, "path"))
		if err != nil {
			return nil, 0, err
		}
		if seen[relativePath] {
			return nil, 0, fmt.Errorf("duplicate static site file path: %s", relativePath)
		}
		content := strings.TrimSpace(stringArg(row, "content"))
		if content == "" {
			return nil, 0, fmt.Errorf("file %s content is required", relativePath)
		}
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			return nil, 0, fmt.Errorf("file %s content must be base64", relativePath)
		}
		if len(decoded) > staticSiteMaxFileBytes {
			return nil, 0, fmt.Errorf("file %s exceeds max size %d bytes", relativePath, staticSiteMaxFileBytes)
		}
		totalBytes += len(decoded)
		if totalBytes > staticSiteMaxTotalBytes {
			return nil, 0, fmt.Errorf("static site payload exceeds max total size %d bytes", staticSiteMaxTotalBytes)
		}
		seen[relativePath] = true
		files = append(files, staticSiteFile{Path: relativePath, Content: content, Size: len(decoded)})
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].Path < files[j].Path
	})
	return files, totalBytes, nil
}

func normalizeStaticSiteFilePath(value string) (string, error) {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\\", "/"))
	if strings.HasPrefix(value, "/") || strings.Contains(value, "\x00") {
		return "", errors.New("static site file path must be relative")
	}
	rawParts := strings.Split(value, "/")
	for _, part := range rawParts {
		if part == ".." {
			return "", errors.New("static site file path must be relative")
		}
	}
	value = path.Clean("/" + value)
	value = strings.TrimPrefix(value, "/")
	if value == "" || value == "." {
		return "", errors.New("static site file path is invalid")
	}
	if len([]rune(value)) > 500 {
		return "", errors.New("static site file path is too long")
	}
	parts := strings.Split(value, "/")
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			return "", errors.New("static site file path must be relative")
		}
	}
	return value, nil
}

func replaceDirectory(target string, source string) error {
	target = cleanAbs(target)
	source = cleanAbs(source)
	parent := filepath.Dir(target)
	if !pathInside(parent, source) {
		return errors.New("temporary directory must be inside target parent")
	}
	backup := filepath.Join(parent, ".public-backup")
	_ = os.RemoveAll(backup)
	if _, err := os.Stat(target); err == nil {
		if err := os.Rename(target, backup); err != nil {
			return err
		}
	}
	if err := os.Rename(source, target); err != nil {
		if _, statErr := os.Stat(backup); statErr == nil {
			_ = os.Rename(backup, target)
		}
		return err
	}
	_ = os.RemoveAll(backup)
	return nil
}

func writeFileAtomic(target string, data []byte, mode os.FileMode) error {
	target = cleanAbs(target)
	tmp, err := os.CreateTemp(filepath.Dir(target), ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpName)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		return err
	}
	backup := target + ".bak"
	_ = os.Remove(backup)
	if _, err := os.Stat(target); err == nil {
		if err := os.Rename(target, backup); err != nil {
			return err
		}
	}
	if err := os.Rename(tmpName, target); err != nil {
		if _, statErr := os.Stat(backup); statErr == nil {
			_ = os.Rename(backup, target)
		}
		return err
	}
	_ = os.Remove(backup)
	cleanup = false
	return nil
}

func pathInside(root string, target string) bool {
	root = cleanAbs(root)
	target = cleanAbs(target)
	relative, err := filepath.Rel(root, target)
	if err != nil {
		return false
	}
	return relative == "." || (!filepath.IsAbs(relative) && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))
}

func nowUnix() int64 {
	return time.Now().Unix()
}
