package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

const (
	terminalMaxBufferBytes = 512 * 1024
	terminalMaxSessions    = 8
	terminalIdleTimeout    = 15 * time.Minute
	terminalReadWait       = 900 * time.Millisecond
	terminalMaxInputBytes  = 8 * 1024
	terminalDefaultCols    = 120
	terminalDefaultRows    = 30
	terminalMaxCols        = 500
	terminalMaxRows        = 200
)

type terminalManager struct {
	mu       sync.Mutex
	sessions map[string]*terminalSession
}

func newTerminalManager() *terminalManager {
	return &terminalManager{sessions: map[string]*terminalSession{}}
}

// terminalSession owns one pseudo-terminal-backed shell. Output is kept as raw
// bytes in an offset-addressed ring buffer so VT escape sequences and partial
// UTF-8 runes reach the browser untouched.
type terminalSession struct {
	id        string
	shell     string
	cwd       string
	pty       *ptyProcess
	startedAt time.Time

	mu          sync.Mutex
	cond        *sync.Cond
	buffer      []byte
	startOffset int64
	alive       bool
	exitCode    *int
	exitMessage string
	lastUsedAt  time.Time
}

func (manager *terminalManager) open(payload map[string]interface{}) (string, error) {
	workspace := strings.TrimSpace(stringArg(payload, "workspace_path"))
	if workspace != "" {
		resolved, err := validateWorkspaceRoot(workspace)
		if err != nil {
			return "", err
		}
		workspace = resolved
	}
	shell, args, err := terminalShellCommand(stringArg(payload, "shell"))
	if err != nil {
		return "", err
	}
	cols, rows := normalizePTYSize(uint16(intArg(payload, "cols", terminalDefaultCols)), uint16(intArg(payload, "rows", terminalDefaultRows)))

	manager.mu.Lock()
	manager.pruneLocked()
	tooMany := len(manager.sessions) >= terminalMaxSessions
	manager.mu.Unlock()
	if tooMany {
		return "", fmt.Errorf("too many open terminals (limit %d)", terminalMaxSessions)
	}

	session, err := startTerminalSession(shell, args, workspace, cols, rows)
	if err != nil {
		return "", err
	}
	manager.mu.Lock()
	manager.sessions[session.id] = session
	manager.mu.Unlock()

	return jsonResult(map[string]interface{}{
		"terminal_id": session.id,
		"shell":       session.shell,
		"os":          runtime.GOOS,
		"cwd":         session.cwd,
		"cols":        cols,
		"rows":        rows,
		"started_at":  session.startedAt,
		"offset":      int64(0),
	})
}

func (manager *terminalManager) input(payload map[string]interface{}) (string, error) {
	session, err := manager.session(stringArg(payload, "terminal_id"))
	if err != nil {
		return "", err
	}
	data, err := decodeTerminalData(payload)
	if err != nil {
		return "", err
	}
	if len(data) > terminalMaxInputBytes {
		return "", fmt.Errorf("terminal input exceeds %d bytes", terminalMaxInputBytes)
	}
	if err := session.write(data); err != nil {
		return "", err
	}
	return jsonResult(map[string]interface{}{"ok": true, "terminal_id": session.id})
}

func (manager *terminalManager) read(payload map[string]interface{}) (string, error) {
	session, err := manager.session(stringArg(payload, "terminal_id"))
	if err != nil {
		return "", err
	}
	chunk := session.readFrom(int64(intArg(payload, "offset", 0)), terminalReadWait)
	if !chunk.alive {
		manager.remove(session.id)
	}
	result := map[string]interface{}{
		"terminal_id": session.id,
		"data":        base64.StdEncoding.EncodeToString(chunk.data),
		"offset":      chunk.offset,
		"truncated":   chunk.truncated,
		"alive":       chunk.alive,
		"shell":       session.shell,
		"cwd":         session.cwd,
	}
	if chunk.exitCode != nil {
		result["exit_code"] = *chunk.exitCode
	}
	if chunk.exitMessage != "" {
		result["exit_message"] = chunk.exitMessage
	}
	return jsonResult(result)
}

func (manager *terminalManager) resize(payload map[string]interface{}) (string, error) {
	session, err := manager.session(stringArg(payload, "terminal_id"))
	if err != nil {
		return "", err
	}
	cols, rows := normalizePTYSize(uint16(intArg(payload, "cols", terminalDefaultCols)), uint16(intArg(payload, "rows", terminalDefaultRows)))
	if err := session.pty.Resize(cols, rows); err != nil {
		return "", err
	}
	return jsonResult(map[string]interface{}{"ok": true, "terminal_id": session.id, "cols": cols, "rows": rows})
}

func (manager *terminalManager) close(payload map[string]interface{}) (string, error) {
	id := strings.TrimSpace(stringArg(payload, "terminal_id"))
	if id == "" {
		return "", errors.New("terminal_id is required")
	}
	manager.remove(id)
	return jsonResult(map[string]interface{}{"ok": true, "terminal_id": id})
}

// count reports how many terminals are live, which the poll loop uses to decide
// whether it should ask the server for lower-latency task delivery.
func (manager *terminalManager) count() int {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.pruneLocked()
	return len(manager.sessions)
}

func (manager *terminalManager) session(id string) (*terminalSession, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errors.New("terminal_id is required")
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	manager.pruneLocked()
	session := manager.sessions[id]
	if session == nil {
		return nil, fmt.Errorf("terminal %s is not open", id)
	}
	session.touch()
	return session, nil
}

func (manager *terminalManager) remove(id string) {
	manager.mu.Lock()
	session := manager.sessions[id]
	delete(manager.sessions, id)
	manager.mu.Unlock()
	if session != nil {
		session.shutdown()
	}
}

// pruneLocked drops sessions whose shell exited or that no client has polled
// for a while. Callers must hold manager.mu.
func (manager *terminalManager) pruneLocked() {
	for id, session := range manager.sessions {
		if session == nil {
			delete(manager.sessions, id)
			continue
		}
		if !session.isAlive() || session.idleFor() > terminalIdleTimeout {
			delete(manager.sessions, id)
			go session.shutdown()
		}
	}
}

func startTerminalSession(shell string, args []string, workspace string, cols uint16, rows uint16) (*terminalSession, error) {
	terminal, err := startPTY(shell, args, workspace, cols, rows)
	if err != nil {
		return nil, err
	}
	session := &terminalSession{
		id:         newTerminalID(),
		shell:      terminalShellLabel(shell),
		cwd:        workspace,
		pty:        terminal,
		startedAt:  time.Now(),
		alive:      true,
		lastUsedAt: time.Now(),
	}
	session.cond = sync.NewCond(&session.mu)
	go session.pump()
	go session.wait()
	return session, nil
}

func (session *terminalSession) pump() {
	chunk := make([]byte, 16*1024)
	for {
		read, err := session.pty.Read(chunk)
		if read > 0 {
			session.append(chunk[:read])
		}
		if err != nil {
			return
		}
	}
}

func (session *terminalSession) wait() {
	code, err := session.pty.Wait()
	session.mu.Lock()
	session.alive = false
	if err != nil {
		session.exitMessage = err.Error()
	} else {
		session.exitCode = &code
	}
	session.cond.Broadcast()
	session.mu.Unlock()
}

func (session *terminalSession) append(data []byte) {
	if len(data) == 0 {
		return
	}
	session.mu.Lock()
	session.buffer = append(session.buffer, data...)
	if overflow := len(session.buffer) - terminalMaxBufferBytes; overflow > 0 {
		session.buffer = append(session.buffer[:0], session.buffer[overflow:]...)
		session.startOffset += int64(overflow)
	}
	session.cond.Broadcast()
	session.mu.Unlock()
}

type terminalChunk struct {
	data        []byte
	offset      int64
	truncated   bool
	alive       bool
	exitCode    *int
	exitMessage string
}

// readFrom returns everything buffered past offset, waiting up to maxWait for
// the shell to produce something so idle polls stay cheap without lagging.
func (session *terminalSession) readFrom(offset int64, maxWait time.Duration) terminalChunk {
	expired := false
	waker := time.AfterFunc(maxWait, func() {
		session.mu.Lock()
		expired = true
		session.cond.Broadcast()
		session.mu.Unlock()
	})
	defer waker.Stop()

	session.mu.Lock()
	defer session.mu.Unlock()
	for session.alive && !expired && session.endOffsetLocked() <= offset {
		session.cond.Wait()
	}
	truncated := false
	if offset < session.startOffset {
		offset = session.startOffset
		truncated = true
	}
	end := session.endOffsetLocked()
	if offset > end {
		offset = end
	}
	data := append([]byte(nil), session.buffer[offset-session.startOffset:]...)
	session.lastUsedAt = time.Now()
	return terminalChunk{
		data:        data,
		offset:      end,
		truncated:   truncated,
		alive:       session.alive,
		exitCode:    session.exitCode,
		exitMessage: session.exitMessage,
	}
}

func (session *terminalSession) endOffsetLocked() int64 {
	return session.startOffset + int64(len(session.buffer))
}

func (session *terminalSession) write(data []byte) error {
	session.mu.Lock()
	alive := session.alive
	session.lastUsedAt = time.Now()
	session.mu.Unlock()
	if !alive {
		return errors.New("terminal has exited")
	}
	if len(data) == 0 {
		return nil
	}
	_, err := session.pty.Write(data)
	return err
}

func (session *terminalSession) isAlive() bool {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.alive
}

func (session *terminalSession) idleFor() time.Duration {
	session.mu.Lock()
	defer session.mu.Unlock()
	return time.Since(session.lastUsedAt)
}

func (session *terminalSession) touch() {
	session.mu.Lock()
	session.lastUsedAt = time.Now()
	session.mu.Unlock()
}

// shutdown hangs up the terminal so the shell exits, then kills it if it lingers.
func (session *terminalSession) shutdown() {
	session.pty.Close()
	deadline := time.Now().Add(2 * time.Second)
	for session.isAlive() && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if session.isAlive() {
		_ = session.pty.Kill()
	}
}

// decodeTerminalData accepts keystrokes as base64 so control bytes and escape
// sequences survive the JSON round trip unchanged.
func decodeTerminalData(payload map[string]interface{}) ([]byte, error) {
	encoded := stringArg(payload, "data")
	if encoded == "" {
		return nil, nil
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("terminal input must be base64: %w", err)
	}
	return data, nil
}

func normalizePTYSize(cols uint16, rows uint16) (uint16, uint16) {
	if cols == 0 || cols > terminalMaxCols {
		cols = terminalDefaultCols
	}
	if rows == 0 || rows > terminalMaxRows {
		rows = terminalDefaultRows
	}
	return cols, rows
}

type terminalShellCandidate struct {
	name string
	args []string
}

// terminalShellCommand picks the shell that matches the host OS, so a Windows
// connector opens a Windows shell while macOS and Linux connectors open their
// usual login shell. The first available candidate wins unless the caller asks
// for a specific shell by name.
func terminalShellCommand(requested string) (string, []string, error) {
	requested = terminalShellKey(requested)
	candidates := terminalShellCandidates()
	if requested != "" {
		for _, candidate := range candidates {
			if terminalShellKey(candidate.name) != requested {
				continue
			}
			path, err := exec.LookPath(candidate.name)
			if err != nil {
				return "", nil, fmt.Errorf("shell %q is not available on this device", requested)
			}
			return path, candidate.args, nil
		}
		return "", nil, fmt.Errorf("unsupported shell %q", requested)
	}
	for _, candidate := range candidates {
		if path, err := exec.LookPath(candidate.name); err == nil {
			return path, candidate.args, nil
		}
	}
	return "", nil, errors.New("no supported shell found on this device")
}

func terminalShellCandidates() []terminalShellCandidate {
	switch runtime.GOOS {
	case "windows":
		return []terminalShellCandidate{
			{"cmd.exe", nil},
			{"powershell.exe", []string{"-NoLogo", "-NoExit", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8"}},
			{"pwsh.exe", []string{"-NoLogo", "-NoExit"}},
		}
	case "darwin":
		return []terminalShellCandidate{
			{"zsh", []string{"-i"}},
			{"bash", []string{"-i"}},
			{"sh", []string{"-i"}},
		}
	default:
		return []terminalShellCandidate{
			{"bash", []string{"-i"}},
			{"zsh", []string{"-i"}},
			{"sh", []string{"-i"}},
		}
	}
}

func terminalShellKey(name string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(name)), ".exe")
}

func terminalShellLabel(shell string) string {
	if index := strings.LastIndexAny(shell, `/\`); index >= 0 {
		return shell[index+1:]
	}
	return shell
}

func newTerminalID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprintf("term_%d", time.Now().UnixNano())
	}
	return "term_" + hex.EncodeToString(buffer)
}

func jsonResult(payload map[string]interface{}) (string, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

var _ = io.EOF
