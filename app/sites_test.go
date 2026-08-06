package main

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStaticSiteDeployServeDisableDelete(t *testing.T) {
	manager, err := newStaticSiteManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	content := base64.StdEncoding.EncodeToString([]byte("<h1>Hello</h1>"))
	result, err := manager.deploy(map[string]interface{}{
		"site_id":     "acs_test",
		"domain_name": "site.example.com",
		"enabled":     true,
		"files": []interface{}{
			map[string]interface{}{"path": "index.html", "content": content},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result, "deployed static site site.example.com") {
		t.Fatalf("unexpected result: %s", result)
	}
	req := httptest.NewRequest(http.MethodGet, "http://site.example.com/", nil)
	req.Host = "site.example.com"
	recorder := httptest.NewRecorder()
	manager.handle(recorder, req)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "Hello") {
		t.Fatalf("unexpected response: %d %s", recorder.Code, recorder.Body.String())
	}
	if _, err := manager.setEnabled(map[string]interface{}{"domain_name": "site.example.com", "enabled": false}); err != nil {
		t.Fatal(err)
	}
	recorder = httptest.NewRecorder()
	manager.handle(recorder, req)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	if _, err := manager.delete(map[string]interface{}{"domain_name": "site.example.com"}); err != nil {
		t.Fatal(err)
	}
	recorder = httptest.NewRecorder()
	manager.handle(recorder, req)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}

func TestStaticSiteRoutesReloadFromManifest(t *testing.T) {
	dataDir := t.TempDir()
	manager, err := newStaticSiteManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	_, err = manager.deploy(map[string]interface{}{
		"site_id":     "acs_reload",
		"domain_name": "reload.example.com",
		"files": []interface{}{
			map[string]interface{}{"path": "index.html", "content": base64.StdEncoding.EncodeToString([]byte("reload"))},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := newStaticSiteManager(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := reloaded.routes["reload.example.com"]; !ok {
		t.Fatalf("expected route to reload")
	}
	publicPath := filepath.Join(reloaded.routes["reload.example.com"].Public, "index.html")
	if data, err := os.ReadFile(publicPath); err != nil || string(data) != "reload" {
		t.Fatalf("unexpected public file: %q %v", string(data), err)
	}
}

func TestStaticSiteRejectsEscapingPath(t *testing.T) {
	_, _, err := normalizeStaticSiteFiles([]interface{}{
		map[string]interface{}{"path": "../index.html", "content": base64.StdEncoding.EncodeToString([]byte("bad"))},
	})
	if err == nil {
		t.Fatal("expected path validation error")
	}
}
