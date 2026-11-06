package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestActionListDirectoriesListsFoldersOnly(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "beta"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "alpha"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	listing, err := actionListDirectories("", map[string]interface{}{"path": root})
	if err != nil {
		t.Fatal(err)
	}
	if listing.Path != filepath.Clean(root) {
		t.Fatalf("unexpected path: %q", listing.Path)
	}
	if len(listing.Directories) != 2 {
		t.Fatalf("only folders belong in the picker: %+v", listing.Directories)
	}
	if listing.Directories[0].Name != "alpha" || listing.Directories[1].Name != "beta" {
		t.Fatalf("expected alphabetical order: %+v", listing.Directories)
	}
	if listing.Directories[0].Kind != "folder" || listing.Directories[0].Path != filepath.Join(root, "alpha") {
		t.Fatalf("unexpected entry: %+v", listing.Directories[0])
	}
}

func TestActionListDirectoriesRefusesRelativeAndMissingPaths(t *testing.T) {
	if _, err := actionListDirectories("", map[string]interface{}{"path": "relative/path"}); err == nil {
		t.Fatal("browsing must not guess at a relative path")
	}
	if _, err := actionListDirectories("", map[string]interface{}{"path": filepath.Join(t.TempDir(), "missing")}); err == nil {
		t.Fatal("a missing folder must be an error")
	}
}

func TestActionListDirectoriesStartsAtTheWorkspaceOrHome(t *testing.T) {
	workspace := t.TempDir()
	listing, err := actionListDirectories(workspace, map[string]interface{}{})
	if err != nil || listing.Path != filepath.Clean(workspace) {
		t.Fatalf("the session workspace is the starting point: %+v %v", listing, err)
	}
	if runtime.GOOS == "windows" {
		drives, err := actionListDirectories("", map[string]interface{}{})
		if err != nil {
			t.Fatalf("Windows must offer its drives: %v", err)
		}
		if len(drives.Directories) > 0 && drives.Directories[0].Kind != "drive" {
			t.Fatalf("expected drive entries: %+v", drives.Directories)
		}
	}
}

func TestActionOpenPathKeepsToTheWorkspace(t *testing.T) {
	workspace := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspace, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []openKind{openFileManager, openTerminal, openVSCode} {
		if _, err := actionOpenPath(workspace, map[string]interface{}{"path": filepath.Dir(workspace)}, kind); err == nil {
			t.Fatalf("%s must refuse a folder outside the workspace", kind)
		}
		if _, err := actionOpenPath(workspace, map[string]interface{}{"path": "sub"}, openFileManager); err != nil {
			// Launching a window may legitimately fail on a headless host; the
			// path check is what this test is about, so only a path refusal fails.
			if strings.Contains(err.Error(), "outside the workspace") {
				t.Fatalf("a folder inside the workspace must be accepted: %v", err)
			}
		}
	}
	if _, err := actionOpenPath("", map[string]interface{}{"path": workspace}, openFileManager); err == nil {
		t.Fatal("opening needs a workspace to be confined to")
	}
	if _, err := actionOpenPath(workspace, map[string]interface{}{"path": "missing"}, openFileManager); err == nil {
		t.Fatal("a missing folder must be refused")
	}
}

func TestActionPickDirectoryUsesTheOverrideCommand(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the override is exercised with a POSIX shell")
	}
	initial := t.TempDir()
	// The override receives the starting folder as its last argument, so this
	// prints exactly what it was handed.
	t.Setenv("VELOCE_CONNECTOR_PICK_COMMAND", "sh -c 'printf %s \"$1\"' pick")
	picked, err := actionPickDirectory(map[string]interface{}{"path": initial})
	if err != nil {
		t.Fatalf("the override command must answer: %v", err)
	}
	if picked.Cancelled || picked.Path != filepath.Clean(initial) {
		t.Fatalf("unexpected answer: %+v", picked)
	}
}

func TestActionPickDirectoryTreatsAnEmptyAnswerAsCancelled(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the override is exercised with a POSIX shell")
	}
	t.Setenv("VELOCE_CONNECTOR_PICK_COMMAND", "sh -c 'exit 0'")
	picked, err := actionPickDirectory(map[string]interface{}{})
	if err != nil {
		t.Fatalf("an empty answer is a cancelled dialog: %v", err)
	}
	if !picked.Cancelled {
		t.Fatalf("expected a cancelled dialog, got %+v", picked)
	}
}

func TestSplitCommandLineKeepsQuotedPathsTogether(t *testing.T) {
	parts, err := splitCommandLine(`zenity --file-selection --title "Pick a folder" '/tmp/with space'`)
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{"zenity", "--file-selection", "--title", "Pick a folder", "/tmp/with space"}
	if len(parts) != len(expected) {
		t.Fatalf("unexpected split: %v", parts)
	}
	for index, value := range expected {
		if parts[index] != value {
			t.Fatalf("index %d: expected %q, got %q", index, value, parts[index])
		}
	}
	if _, err := splitCommandLine(`sh -c 'unterminated`); err == nil {
		t.Fatal("an unterminated quote must be an error")
	}
}

func TestJsonActionAnswersWithTheObjectTheHostParses(t *testing.T) {
	result, err := jsonAction(directoryListing{
		Path:    "/work",
		Entries: []directoryEntry{{Name: "a.txt", Path: "/work/a.txt", Type: "file", Size: 3}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var decoded directoryListing
	if err := json.Unmarshal([]byte(result.Result), &decoded); err != nil {
		t.Fatalf("the result must be JSON: %v (%q)", err, result.Result)
	}
	if decoded.Path != "/work" || len(decoded.Entries) != 1 || decoded.Entries[0].Name != "a.txt" {
		t.Fatalf("unexpected decoded answer: %+v", decoded)
	}
}
