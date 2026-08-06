package main

import (
	"encoding/base64"
	"encoding/json"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func decodeTerminalResult(t *testing.T, result string) map[string]interface{} {
	t.Helper()
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("decode terminal result: %v (%s)", err, result)
	}
	return payload
}

func openTestTerminal(t *testing.T, manager *terminalManager) string {
	t.Helper()
	result, err := manager.open(map[string]interface{}{})
	if err != nil {
		t.Fatalf("open terminal: %v", err)
	}
	payload := decodeTerminalResult(t, result)
	id, _ := payload["terminal_id"].(string)
	if id == "" {
		t.Fatalf("expected terminal_id in %s", result)
	}
	return id
}

// readUntil polls the terminal until want shows up or the budget runs out,
// mirroring how the web client drains output.
func readUntil(t *testing.T, manager *terminalManager, id string, want string) string {
	t.Helper()
	transcript := ""
	offset := 0
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		result, err := manager.read(map[string]interface{}{"terminal_id": id, "offset": offset})
		if err != nil {
			t.Fatalf("read terminal: %v", err)
		}
		payload := decodeTerminalResult(t, result)
		encoded, _ := payload["data"].(string)
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			t.Fatalf("decode terminal output: %v", err)
		}
		transcript += string(data)
		if next, ok := payload["offset"].(float64); ok {
			offset = int(next)
		}
		if strings.Contains(transcript, want) {
			return transcript
		}
		if alive, ok := payload["alive"].(bool); ok && !alive {
			return transcript
		}
	}
	return transcript
}

func TestTerminalManagerRunsCommandAndKeepsSession(t *testing.T) {
	manager := newTerminalManager()
	id := openTestTerminal(t, manager)
	defer manager.remove(id)

	if _, err := manager.input(map[string]interface{}{"terminal_id": id, "data": base64.StdEncoding.EncodeToString([]byte("echo veloce-terminal-ok\r"))}); err != nil {
		t.Fatalf("write command: %v", err)
	}
	if transcript := readUntil(t, manager, id, "veloce-terminal-ok"); !strings.Contains(transcript, "veloce-terminal-ok") {
		t.Fatalf("expected command output, got %q", transcript)
	}

	// A second command proves the shell process survived the first one.
	if _, err := manager.input(map[string]interface{}{"terminal_id": id, "data": base64.StdEncoding.EncodeToString([]byte("echo veloce-second-ok\r"))}); err != nil {
		t.Fatalf("write second command: %v", err)
	}
	if transcript := readUntil(t, manager, id, "veloce-second-ok"); !strings.Contains(transcript, "veloce-second-ok") {
		t.Fatalf("expected second command output, got %q", transcript)
	}
}

func TestTerminalManagerReadIsIncremental(t *testing.T) {
	manager := newTerminalManager()
	id := openTestTerminal(t, manager)
	defer manager.remove(id)

	if _, err := manager.input(map[string]interface{}{"terminal_id": id, "data": base64.StdEncoding.EncodeToString([]byte("echo first-chunk\r"))}); err != nil {
		t.Fatalf("write command: %v", err)
	}
	readUntil(t, manager, id, "first-chunk")

	result, err := manager.read(map[string]interface{}{"terminal_id": id, "offset": 1 << 30})
	if err != nil {
		t.Fatalf("read past end: %v", err)
	}
	payload := decodeTerminalResult(t, result)
	if data, _ := payload["data"].(string); data != "" {
		t.Fatalf("expected no data past the end offset, got %q", data)
	}
}

func TestTerminalManagerRejectsUnknownTerminal(t *testing.T) {
	manager := newTerminalManager()
	if _, err := manager.input(map[string]interface{}{"terminal_id": "term_missing", "data": base64.StdEncoding.EncodeToString([]byte("echo hi\r"))}); err == nil {
		t.Fatal("expected an error for an unknown terminal")
	}
	if _, err := manager.read(map[string]interface{}{}); err == nil {
		t.Fatal("expected an error when terminal_id is missing")
	}
}

func TestTerminalManagerCloseStopsSession(t *testing.T) {
	manager := newTerminalManager()
	id := openTestTerminal(t, manager)
	if _, err := manager.close(map[string]interface{}{"terminal_id": id}); err != nil {
		t.Fatalf("close terminal: %v", err)
	}
	if _, err := manager.read(map[string]interface{}{"terminal_id": id, "offset": 0}); err == nil {
		t.Fatal("expected reads to fail after close")
	}
}

func TestTerminalManagerRejectsMissingWorkspace(t *testing.T) {
	manager := newTerminalManager()
	if _, err := manager.open(map[string]interface{}{"workspace_path": "relative/path"}); err == nil {
		t.Fatal("expected a relative workspace path to be rejected")
	}
}

// The task dispatcher must handle terminal actions itself; falling through to
// the workspace switch reports them as unsupported actions.
func TestExecuteTaskDispatchesTerminalActions(t *testing.T) {
	client := connectorClient{terminals: newTerminalManager()}

	result, err := client.executeTask(connectorTask{ID: "t1", Action: "terminal_open", Payload: map[string]interface{}{}})
	if err != nil {
		t.Fatalf("terminal_open: %v", err)
	}
	payload := decodeTerminalResult(t, result.Result)
	id, _ := payload["terminal_id"].(string)
	if id == "" {
		t.Fatalf("expected a terminal id in %s", result.Result)
	}
	defer client.terminals.remove(id)

	for _, action := range []string{"terminal_input", "terminal_read", "terminal_resize", "terminal_close"} {
		task := connectorTask{ID: "t2", Action: action, Payload: map[string]interface{}{"terminal_id": id, "data": "", "offset": 0, "cols": 120, "rows": 30}}
		if _, err := client.executeTask(task); err != nil {
			t.Fatalf("%s: %v", action, err)
		}
	}

	if _, err := client.executeTask(connectorTask{ID: "t3", Action: "terminal_bogus"}); err == nil {
		t.Fatal("expected an unknown terminal action to be rejected")
	}
}

func TestTerminalTaskActionsAreDispatchedOffThePollLoop(t *testing.T) {
	for _, action := range []string{"terminal_open", "terminal_input", "terminal_read", "terminal_resize", "terminal_close"} {
		if !isTerminalTaskAction(action) {
			t.Fatalf("%s should run alongside the poll loop", action)
		}
	}
	if isTerminalTaskAction("run_command") {
		t.Fatal("run_command must stay on the serial poll loop")
	}
}

func TestTerminalShellCommandMatchesHostOS(t *testing.T) {
	shell, args, err := terminalShellCommand("")
	if err != nil {
		t.Fatalf("resolve shell: %v", err)
	}
	label := terminalShellKey(terminalShellLabel(shell))
	if runtime.GOOS == "windows" {
		switch label {
		case "cmd", "powershell", "pwsh":
		default:
			t.Fatalf("unexpected windows shell %q", label)
		}
		return
	}
	switch label {
	case "bash", "zsh", "sh":
	default:
		t.Fatalf("unexpected unix shell %q (args %v)", label, args)
	}
}

func TestTerminalShellCommandRejectsUnknownShell(t *testing.T) {
	if _, _, err := terminalShellCommand("nushell"); err == nil {
		t.Fatal("expected an unsupported shell to be rejected")
	}
}

func TestTerminalSessionBufferDropsOldestBytes(t *testing.T) {
	session := &terminalSession{alive: true, lastUsedAt: time.Now()}
	session.cond = sync.NewCond(&session.mu)
	session.append([]byte(strings.Repeat("a", terminalMaxBufferBytes)))
	session.append([]byte(strings.Repeat("b", 1024)))

	chunk := session.readFrom(0, time.Millisecond)
	if len(chunk.data) != terminalMaxBufferBytes {
		t.Fatalf("expected the buffer to stay capped, got %d bytes", len(chunk.data))
	}
	if !chunk.truncated {
		t.Fatal("expected truncated to be reported when the oldest bytes are dropped")
	}
	if !strings.HasSuffix(string(chunk.data), strings.Repeat("b", 1024)) {
		t.Fatal("expected the newest bytes to be kept")
	}
	if chunk.offset != int64(terminalMaxBufferBytes+1024) {
		t.Fatalf("unexpected end offset %d", chunk.offset)
	}
}
