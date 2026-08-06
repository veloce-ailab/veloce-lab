package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommitDeltaAppliesMutationsInMemoryBeforeWriting(t *testing.T) {
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "a.txt"), []byte("alpha beta gamma"), 0644); err != nil {
		t.Fatal(err)
	}
	overwrite := true

	result, err := commitDelta(workspace, map[string]interface{}{
		"mutations": []map[string]interface{}{
			{"action": "replace_text", "path": "a.txt", "old_text": "beta", "new_text": "BETA"},
			{"action": "replace_text", "path": "a.txt", "old_text": "gamma", "new_text": "GAMMA"},
			{"action": "write_file", "path": "dir/b.txt", "content": "created", "overwrite": overwrite, "create_dirs": true},
		},
	})
	if err != nil {
		t.Fatalf("commitDelta returned error: %v", err)
	}
	if !strings.Contains(result, "Committed 3 mutation(s) across 2 file(s).") {
		t.Fatalf("unexpected result: %s", result)
	}
	assertFileContent(t, filepath.Join(workspace, "a.txt"), "alpha BETA GAMMA")
	assertFileContent(t, filepath.Join(workspace, "dir", "b.txt"), "created")
}

func TestCommitDeltaRejectsAmbiguousReplacementWithoutWriting(t *testing.T) {
	workspace := t.TempDir()
	first := filepath.Join(workspace, "first.txt")
	second := filepath.Join(workspace, "second.txt")
	if err := os.WriteFile(first, []byte("unchanged"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(second, []byte("same same"), 0644); err != nil {
		t.Fatal(err)
	}
	overwrite := true

	_, err := commitDelta(workspace, map[string]interface{}{
		"mutations": []map[string]interface{}{
			{"action": "write_file", "path": "first.txt", "content": "changed", "overwrite": overwrite},
			{"action": "replace_text", "path": "second.txt", "old_text": "same", "new_text": "other"},
		},
	})
	if err == nil {
		t.Fatal("expected ambiguous replacement to fail")
	}
	assertFileContent(t, first, "unchanged")
	assertFileContent(t, second, "same same")
}

func TestCommitDeltaRejectsEscapingPath(t *testing.T) {
	workspace := t.TempDir()
	overwrite := true

	_, err := commitDelta(workspace, map[string]interface{}{
		"mutations": []map[string]interface{}{
			{"action": "write_file", "path": "../outside.txt", "content": "bad", "overwrite": overwrite},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "escapes the workspace") {
		t.Fatalf("expected workspace escape error, got %v", err)
	}
}

func TestFileSHA256HashesFullFileAndMissingFile(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "a.txt")
	if err := os.WriteFile(path, []byte("current"), 0644); err != nil {
		t.Fatal(err)
	}
	hash, err := fileSHA256(workspace, "a.txt")
	if err != nil {
		t.Fatalf("fileSHA256 returned error: %v", err)
	}
	if hash != sha256String("current") {
		t.Fatalf("hash = %q, want %q", hash, sha256String("current"))
	}
	missing, err := fileSHA256(workspace, "missing.txt")
	if err != nil {
		t.Fatalf("missing file should return empty hash, got %v", err)
	}
	if missing != sha256String("") {
		t.Fatalf("missing hash = %q, want %q", missing, sha256String(""))
	}
}

func TestCommitDeltaChecksBaseSHA(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "a.txt")
	if err := os.WriteFile(path, []byte("current"), 0644); err != nil {
		t.Fatal(err)
	}
	overwrite := true

	_, err := commitDelta(workspace, map[string]interface{}{
		"mutations": []map[string]interface{}{
			{"action": "write_file", "path": "a.txt", "content": "next", "overwrite": overwrite, "base_sha256": sha256String("stale")},
		},
	})
	if err == nil || !strings.Contains(err.Error(), "base_sha256 mismatch") {
		t.Fatalf("expected base_sha256 mismatch, got %v", err)
	}
	assertFileContent(t, path, "current")
}

func TestCommitDeltaDeletesFile(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "a.txt")
	if err := os.WriteFile(path, []byte("current"), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := commitDelta(workspace, map[string]interface{}{
		"mutations": []map[string]interface{}{
			{"action": "delete_file", "path": "a.txt", "base_sha256": sha256String("current")},
		},
	})
	if err != nil {
		t.Fatalf("commitDelta returned error: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected file to be deleted, got %v", err)
	}
}

func assertFileContent(t *testing.T, path string, expected string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != expected {
		t.Fatalf("%s content = %q, want %q", path, string(data), expected)
	}
}
