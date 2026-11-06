package main

// The actions that reach past a workspace and onto the machine itself:
// browsing folders for the workspace picker, asking the user for one with the
// platform's own dialog, and handing a folder to the file manager, a terminal or
// VS Code.
//
// These mirror `packages/device-local/src/actions.ts` for the same reason the
// file actions do — the host cannot tell the two connectors apart. Browsing
// deliberately accepts any absolute path (that is how a workspace gets chosen);
// everything that acts on a folder is confined to the session's workspace, so a
// stale or model-supplied path cannot reach elsewhere.

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type browseEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Kind string `json:"kind"`
}

type browseListing struct {
	Path        string        `json:"path"`
	Directories []browseEntry `json:"directories"`
}

// actionListDirectories lists the sub-folders of a folder, which is what the
// workspace picker renders. With no path the machine's own starting point is
// used: the drives on Windows, the home folder elsewhere.
func actionListDirectories(workspace string, payload map[string]interface{}) (browseListing, error) {
	requested := strings.TrimSpace(stringArg(payload, "path"))
	if requested == "" {
		requested = strings.TrimSpace(stringArg(payload, "workspace_path"))
	}
	if requested == "" && strings.TrimSpace(workspace) != "" {
		requested = workspace
	}
	if requested == "" {
		if runtime.GOOS == "windows" {
			return browseListing{Path: "", Directories: windowsDriveEntries()}, nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return browseListing{}, err
		}
		requested = home
	}
	target := requested
	if !filepath.IsAbs(target) {
		return browseListing{}, errors.New("path must be absolute")
	}
	target = cleanAbs(target)
	entries, err := os.ReadDir(target)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return browseListing{}, fmt.Errorf("folder not found: %s", target)
		}
		if errors.Is(err, os.ErrPermission) {
			return browseListing{}, fmt.Errorf("permission denied: %s", target)
		}
		return browseListing{}, err
	}
	sort.Slice(entries, func(left, right int) bool {
		return strings.ToLower(entries[left].Name()) < strings.ToLower(entries[right].Name())
	})
	listing := browseListing{Path: target, Directories: []browseEntry{}}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if len(listing.Directories) >= maxDirEntries {
			break
		}
		listing.Directories = append(listing.Directories, browseEntry{
			Name: entry.Name(),
			Path: filepath.Join(target, entry.Name()),
			Kind: "folder",
		})
	}
	return listing, nil
}

func windowsDriveEntries() []browseEntry {
	drives := []browseEntry{}
	for letter := 'A'; letter <= 'Z'; letter++ {
		root := fmt.Sprintf("%c:\\", letter)
		if info, err := os.Stat(root); err == nil && info.IsDir() {
			drives = append(drives, browseEntry{Name: fmt.Sprintf("%c:", letter), Path: root, Kind: "drive"})
		}
	}
	return drives
}

type pickedDirectory struct {
	Path      string `json:"path"`
	Cancelled bool   `json:"cancelled"`
}

// actionPickDirectory asks the user for a folder with the platform's own dialog.
// `VELOCE_CONNECTOR_PICK_COMMAND` replaces the whole thing with a command that
// receives the starting folder as its only argument and prints the chosen one,
// which is how a headless or test host supplies its own picker.
func actionPickDirectory(payload map[string]interface{}) (pickedDirectory, error) {
	initial := strings.TrimSpace(stringArg(payload, "path"))
	if initial == "" {
		initial = strings.TrimSpace(stringArg(payload, "connector_workspace_path"))
	}
	title := strings.TrimSpace(stringArg(payload, "title"))
	if title == "" {
		title = "Select a workspace folder"
	}
	if override := strings.TrimSpace(os.Getenv("VELOCE_CONNECTOR_PICK_COMMAND")); override != "" {
		parts, err := splitCommandLine(override)
		if err != nil {
			return pickedDirectory{}, err
		}
		if len(parts) == 0 {
			return pickedDirectory{}, errors.New("VELOCE_CONNECTOR_PICK_COMMAND is empty")
		}
		return runPicker(parts[0], append(parts[1:], initial)...)
	}
	switch runtime.GOOS {
	case "windows":
		script := `Add-Type -AssemblyName System.Windows.Forms;` +
			`$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;` +
			`$dialog.Description = '` + strings.ReplaceAll(title, "'", "''") + `';` +
			initialFolderScript(initial) +
			`if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }`
		return runPicker("powershell", "-NoProfile", "-STA", "-Command", script)
	case "darwin":
		script := `POSIX path of (choose folder with prompt "` + strings.ReplaceAll(title, `"`, `\"`) + `"`
		if initial != "" {
			script += ` default location POSIX file "` + strings.ReplaceAll(initial, `"`, `\"`) + `"`
		}
		return runPicker("osascript", "-e", script+")")
	default:
		if _, err := exec.LookPath("zenity"); err == nil {
			args := []string{"--file-selection", "--directory", "--title", title}
			if initial != "" {
				args = append(args, "--filename", strings.TrimSuffix(initial, string(filepath.Separator))+string(filepath.Separator))
			}
			return runPicker("zenity", args...)
		}
		if _, err := exec.LookPath("kdialog"); err == nil {
			args := []string{"--getexistingdirectory", initial, "--title", title}
			return runPicker("kdialog", args...)
		}
		return pickedDirectory{}, errors.New("no folder dialog is available on this machine (install zenity or kdialog)")
	}
}

func initialFolderScript(initial string) string {
	if initial == "" {
		return ""
	}
	escaped := strings.ReplaceAll(initial, "'", "''")
	return `$dialog.SelectedPath = '` + escaped + `';`
}

// runPicker runs a dialog command and reads the folder it printed. A non-zero
// exit is a cancelled dialog, which is a result rather than a failure.
func runPicker(name string, args ...string) (pickedDirectory, error) {
	output, err := exec.Command(name, args...).Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return pickedDirectory{Cancelled: true}, nil
		}
		return pickedDirectory{}, err
	}
	chosen := strings.TrimSpace(string(output))
	if chosen == "" {
		return pickedDirectory{Cancelled: true}, nil
	}
	return pickedDirectory{Path: cleanAbs(chosen), Cancelled: false}, nil
}

// openKind is what a folder is opened in: the file manager, a terminal, or the
// editor. Each is detached: the connector must not wait for a window to close.
type openKind string

const (
	openFileManager openKind = "file-manager"
	openTerminal    openKind = "terminal"
	openVSCode      openKind = "vscode"
)

type openedPath struct {
	OK   bool   `json:"ok"`
	Path string `json:"path"`
}

func actionOpenPath(workspace string, payload map[string]interface{}, kind openKind) (openedPath, error) {
	root := strings.TrimSpace(workspace)
	requested := strings.TrimSpace(stringArg(payload, "path"))
	if requested == "" {
		requested = root
	}
	if root == "" {
		return openedPath{}, errors.New("a workspace path is required")
	}
	if requested == "" {
		return openedPath{}, errors.New("a path is required")
	}
	target, err := actionPath(root, requested)
	if err != nil {
		return openedPath{}, err
	}
	info, err := os.Stat(target)
	if err != nil || !info.IsDir() {
		return openedPath{}, errors.New("path is not a directory")
	}
	name, args, err := openCommand(kind, target)
	if err != nil {
		return openedPath{}, err
	}
	if err := startDetached(name, args...); err != nil {
		return openedPath{}, err
	}
	return openedPath{OK: true, Path: target}, nil
}

func openCommand(kind openKind, target string) (string, []string, error) {
	switch kind {
	case openVSCode:
		return "code", []string{target}, nil
	case openTerminal:
		switch runtime.GOOS {
		case "windows":
			return "wt.exe", []string{"-d", target}, nil
		case "darwin":
			return "open", []string{"-a", "Terminal", target}, nil
		default:
			if _, err := exec.LookPath("x-terminal-emulator"); err == nil {
				return "x-terminal-emulator", []string{"--working-directory", target}, nil
			}
			if _, err := exec.LookPath("gnome-terminal"); err == nil {
				return "gnome-terminal", []string{"--working-directory", target}, nil
			}
			if _, err := exec.LookPath("konsole"); err == nil {
				return "konsole", []string{"--workdir", target}, nil
			}
			if _, err := exec.LookPath("xterm"); err == nil {
				return "xterm", []string{"-cd", target}, nil
			}
			return "", nil, errors.New("no terminal emulator is available on this machine")
		}
	default:
		switch runtime.GOOS {
		case "windows":
			return "explorer.exe", []string{target}, nil
		case "darwin":
			return "open", []string{target}, nil
		default:
			return "xdg-open", []string{target}, nil
		}
	}
}

// startDetached launches a window and forgets about it: the child keeps running
// after this process exits, and nothing here waits for it.
func startDetached(name string, args ...string) error {
	command := exec.Command(name, args...)
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

// splitCommandLine splits a command line the way a shell would for the simple
// cases that appear in an override, so a quoted path with spaces still works.
func splitCommandLine(value string) ([]string, error) {
	var parts []string
	var current strings.Builder
	var quote rune
	sawContent := false
	for _, char := range value {
		switch {
		case quote != 0:
			if char == quote {
				quote = 0
				continue
			}
			current.WriteRune(char)
		case char == '"' || char == '\'':
			quote = char
			sawContent = true
		case char == ' ' || char == '\t' || char == '\n':
			if sawContent || current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
				sawContent = false
			}
		default:
			current.WriteRune(char)
			sawContent = true
		}
	}
	if quote != 0 {
		return nil, errors.New("unterminated quote in the command override")
	}
	if sawContent || current.Len() > 0 {
		parts = append(parts, current.String())
	}
	return parts, nil
}
