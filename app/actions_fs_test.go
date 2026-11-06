package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTempFile(t *testing.T, workspace string, name string, content string) string {
	t.Helper()
	target := filepath.Join(workspace, name)
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return target
}

func TestActionPathAcceptsAbsolutePathsInsideTheWorkspaceOnly(t *testing.T) {
	workspace := t.TempDir()
	inside := filepath.Join(workspace, "a.txt")
	if resolved, err := actionPath(workspace, inside); err != nil || resolved != filepath.Clean(inside) {
		t.Fatalf("an absolute path inside the workspace must resolve: %q %v", resolved, err)
	}
	if resolved, err := actionPath(workspace, "nested/b.txt"); err != nil || resolved != filepath.Join(workspace, "nested", "b.txt") {
		t.Fatalf("a relative path must start in the workspace: %q %v", resolved, err)
	}
	if _, err := actionPath(workspace, filepath.Join(workspace, "..", "escape.txt")); err == nil {
		t.Fatal("a path that climbs out of the workspace must be refused")
	}
	if _, err := actionPath(workspace, filepath.Dir(workspace)); err == nil {
		t.Fatal("the workspace's parent must be refused")
	}
	if _, err := actionPath("", "relative.txt"); err == nil {
		t.Fatal("a session without a workspace cannot take a relative path")
	}
}

func TestActionWriteFileOverwritesAndReportsLineCounts(t *testing.T) {
	workspace := t.TempDir()
	writeTempFile(t, workspace, "doc.txt", "one\ntwo\nthree\n")
	// No `overwrite` flag is involved: the tools always mean "make it this".
	mutation, err := actionWriteFile(workspace, map[string]interface{}{
		"path":    "doc.txt",
		"content": "one\ntwo changed\nthree\nfour\n",
	})
	if err != nil {
		t.Fatalf("writing over an existing file must work: %v", err)
	}
	if mutation.Size != len("one\ntwo changed\nthree\nfour\n") {
		t.Fatalf("unexpected size: %d", mutation.Size)
	}
	if mutation.Added != 2 || mutation.Removed != 1 {
		t.Fatalf("expected one rewritten line and one added line, got +%d -%d", mutation.Added, mutation.Removed)
	}
	content, err := os.ReadFile(filepath.Join(workspace, "doc.txt"))
	if err != nil || !strings.Contains(string(content), "two changed") {
		t.Fatalf("expected the new content on disk: %q %v", content, err)
	}
}

func TestActionWriteFileCreatesMissingDirectories(t *testing.T) {
	workspace := t.TempDir()
	if _, err := actionWriteFile(workspace, map[string]interface{}{"path": "a/b/c.txt", "content": "hi"}); err != nil {
		t.Fatalf("a new file in a new folder must work: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workspace, "a", "b", "c.txt")); err != nil {
		t.Fatal(err)
	}
}

func TestActionReplaceTextReplacesEveryOccurrence(t *testing.T) {
	workspace := t.TempDir()
	writeTempFile(t, workspace, "doc.txt", "before before\nbefore\n")
	mutation, err := actionReplaceText(workspace, map[string]interface{}{
		"path":     "doc.txt",
		"old_text": "before",
		"new_text": "after",
	})
	if err != nil {
		t.Fatal(err)
	}
	if mutation.Replacements != 3 {
		t.Fatalf("expected every occurrence to be replaced, got %d", mutation.Replacements)
	}
	content, _ := os.ReadFile(filepath.Join(workspace, "doc.txt"))
	if strings.Contains(string(content), "before") {
		t.Fatalf("a match survived: %q", content)
	}
	// A miss is a result, not a failure.
	missed, err := actionReplaceText(workspace, map[string]interface{}{
		"path": "doc.txt", "old_text": "absent", "new_text": "x",
	})
	if err != nil || missed.Replacements != 0 {
		t.Fatalf("a missing match must report zero replacements: %+v %v", missed, err)
	}
}

func TestActionReadFileRefusesBinaryAndMissingFiles(t *testing.T) {
	workspace := t.TempDir()
	if _, err := actionReadFile(workspace, map[string]interface{}{"path": "missing.txt"}); err == nil || !strings.Contains(err.Error(), "file not found") {
		t.Fatalf("expected a not-found error, got %v", err)
	}
	binary := filepath.Join(workspace, "blob.bin")
	if err := os.WriteFile(binary, []byte{'a', 0, 'b'}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := actionReadFile(workspace, map[string]interface{}{"path": "blob.bin"}); err == nil || !strings.Contains(err.Error(), "binary") {
		t.Fatalf("expected a binary refusal, got %v", err)
	}
	writeTempFile(t, workspace, "text.txt", "hello")
	content, err := actionReadFile(workspace, map[string]interface{}{"path": "text.txt"})
	if err != nil || content.Content != "hello" {
		t.Fatalf("expected the file content: %+v %v", content, err)
	}
	if content.Path != filepath.Join(workspace, "text.txt") {
		t.Fatalf("the answer must name the resolved path: %q", content.Path)
	}
}

func TestActionListDirectoryListsFoldersFirst(t *testing.T) {
	workspace := t.TempDir()
	writeTempFile(t, workspace, "b.txt", "x")
	if err := os.MkdirAll(filepath.Join(workspace, "z-folder"), 0o755); err != nil {
		t.Fatal(err)
	}
	listing, err := actionListDirectory(workspace, map[string]interface{}{"path": ""})
	if err != nil {
		t.Fatal(err)
	}
	if listing.Path != filepath.Clean(workspace) {
		t.Fatalf("unexpected path: %q", listing.Path)
	}
	if len(listing.Entries) != 2 || listing.Entries[0].Type != "directory" || listing.Entries[0].Name != "z-folder" {
		t.Fatalf("folders must come first: %+v", listing.Entries)
	}
	if listing.Entries[1].Type != "file" || listing.Entries[1].Size != 1 {
		t.Fatalf("unexpected file entry: %+v", listing.Entries[1])
	}
	if _, err := actionListDirectory(workspace, map[string]interface{}{"path": "nowhere"}); err == nil {
		t.Fatal("a missing folder must be an error")
	}
}

func TestActionFileSHA256NamesTheResolvedFile(t *testing.T) {
	workspace := t.TempDir()
	writeTempFile(t, workspace, "a.txt", "abc")
	digest, err := actionFileSHA256(workspace, map[string]interface{}{"path": "a.txt"})
	if err != nil {
		t.Fatal(err)
	}
	if digest.SHA256 != sha256String("abc") || digest.Size != 3 {
		t.Fatalf("unexpected digest: %+v", digest)
	}
	if _, err := actionFileSHA256(workspace, map[string]interface{}{"path": "absent.txt"}); err == nil {
		t.Fatal("a missing file must be an error, not an empty hash")
	}
}

func TestLineDiffMatchesTheBuiltInConnector(t *testing.T) {
	// The cases `packages/device-local/tests/line-diff.test.mjs` pins, so both
	// connectors report the same +N/-N for the same edit.
	cases := []struct {
		before, after  string
		added, removed int
	}{
		{"a\nb\nc", "a\nb\nc", 0, 0},
		{"", "a\nb\nc", 3, 0},
		{"a\nb", "", 0, 2},
		{"a\nb", "a\nb\nc\nd", 2, 0},
		{"a\nb\nc\nd", "a\nB\nc\nd", 1, 1},
		{"a\nb\nc", "a\nb\nx\nc", 1, 0},
		{"a\nb\na\nb", "a\nb", 0, 2},
	}
	for _, item := range cases {
		added, removed := lineDiff(item.before, item.after)
		if added != item.added || removed != item.removed {
			t.Fatalf("%q -> %q: expected +%d -%d, got +%d -%d", item.before, item.after, item.added, item.removed, added, removed)
		}
	}
}
