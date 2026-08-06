package main

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	mcpProtocolVersion   = "2025-06-18"
	mcpRequestTimeout    = 5 * time.Minute
	mcpMaxStderrLineSize = 64 * 1024
)

type mcpServerConfig struct {
	ID      string            `json:"id"`
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args"`
	Env     map[string]string `json:"env"`
	Cwd     string            `json:"cwd"`
}

type mcpProcessManager struct {
	mu        sync.Mutex
	processes map[string]*mcpProcess
}

func newMCPProcessManager() *mcpProcessManager {
	return &mcpProcessManager{processes: map[string]*mcpProcess{}}
}

func (manager *mcpProcessManager) listTools(payload map[string]interface{}) (string, error) {
	server, err := mcpServerFromPayload(payload)
	if err != nil {
		return "", err
	}
	process, err := manager.process(server)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), mcpRequestTimeout)
	defer cancel()
	if err := process.ensureInitialized(ctx); err != nil {
		manager.remove(process.key)
		return "", err
	}
	result, err := process.call(ctx, "tools/list", map[string]interface{}{})
	if err != nil {
		manager.remove(process.key)
		return "", err
	}
	return string(result), nil
}

func (manager *mcpProcessManager) callTool(payload map[string]interface{}) (string, error) {
	server, err := mcpServerFromPayload(payload)
	if err != nil {
		return "", err
	}
	name := strings.TrimSpace(stringArg(payload, "name"))
	if name == "" {
		return "", errors.New("mcp tool name is required")
	}
	arguments := mapArg(payload, "arguments")
	if arguments == nil {
		arguments = map[string]interface{}{}
	}
	process, err := manager.process(server)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), mcpRequestTimeout)
	defer cancel()
	if err := process.ensureInitialized(ctx); err != nil {
		manager.remove(process.key)
		return "", err
	}
	result, err := process.call(ctx, "tools/call", map[string]interface{}{
		"name":      name,
		"arguments": arguments,
	})
	if err != nil {
		manager.remove(process.key)
		return "", err
	}
	return string(result), nil
}

func (manager *mcpProcessManager) listProcesses() (string, error) {
	manager.mu.Lock()
	processes := make([]*mcpProcess, 0, len(manager.processes))
	for key, process := range manager.processes {
		if process != nil && process.isAlive() {
			processes = append(processes, process)
		} else {
			delete(manager.processes, key)
		}
	}
	manager.mu.Unlock()
	statuses := make([]mcpProcessStatus, 0, len(processes))
	for _, process := range processes {
		statuses = append(statuses, process.status())
	}
	data, err := json.Marshal(map[string]interface{}{"processes": statuses})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (manager *mcpProcessManager) stopProcess(key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", errors.New("mcp process key is required")
	}
	manager.mu.Lock()
	process := manager.processes[key]
	delete(manager.processes, key)
	manager.mu.Unlock()
	if process == nil {
		return "", errors.New("mcp process not found")
	}
	process.close()
	data, err := json.Marshal(map[string]interface{}{"ok": true, "key": key})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (manager *mcpProcessManager) process(server mcpServerConfig) (*mcpProcess, error) {
	key := mcpServerKey(server)
	manager.mu.Lock()
	if process := manager.processes[key]; process != nil && process.isAlive() {
		manager.mu.Unlock()
		return process, nil
	}
	delete(manager.processes, key)
	manager.mu.Unlock()

	process, err := startMCPProcess(key, server)
	if err != nil {
		return nil, err
	}
	manager.mu.Lock()
	manager.processes[key] = process
	manager.mu.Unlock()
	return process, nil
}

func (manager *mcpProcessManager) remove(key string) {
	manager.mu.Lock()
	process := manager.processes[key]
	delete(manager.processes, key)
	manager.mu.Unlock()
	if process != nil {
		process.close()
	}
}

type mcpProcess struct {
	key         string
	server      mcpServerConfig
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	startedAt   time.Time
	writeMu     sync.Mutex
	mu          sync.Mutex
	responses   map[int64]chan mcpStdioResponse
	idCounter   int64
	initialized bool
	closed      chan struct{}
}

type mcpProcessStatus struct {
	Key             string    `json:"key"`
	ID              string    `json:"id,omitempty"`
	Name            string    `json:"name,omitempty"`
	Command         string    `json:"command"`
	Args            []string  `json:"args,omitempty"`
	Cwd             string    `json:"cwd,omitempty"`
	PID             int       `json:"pid,omitempty"`
	Initialized     bool      `json:"initialized"`
	PendingRequests int       `json:"pending_requests"`
	StartedAt       time.Time `json:"started_at"`
}

type mcpStdioRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int64       `json:"id,omitempty"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type mcpStdioResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      json.RawMessage  `json:"id"`
	Result  json.RawMessage  `json:"result"`
	Error   *mcpJSONRPCError `json:"error"`
	Err     error            `json:"-"`
}

type mcpJSONRPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func (e *mcpJSONRPCError) Error() string {
	return fmt.Sprintf("mcp error %d: %s", e.Code, e.Message)
}

func startMCPProcess(key string, server mcpServerConfig) (*mcpProcess, error) {
	if strings.TrimSpace(server.Command) == "" {
		return nil, errors.New("mcp command is required")
	}
	cmd := exec.Command(server.Command, server.Args...)
	if strings.TrimSpace(server.Cwd) != "" {
		cmd.Dir = server.Cwd
	}
	cmd.Env = os.Environ()
	envKeys := make([]string, 0, len(server.Env))
	for key := range server.Env {
		envKeys = append(envKeys, key)
	}
	sort.Strings(envKeys)
	for _, key := range envKeys {
		cmd.Env = append(cmd.Env, key+"="+server.Env[key])
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	process := &mcpProcess{
		key:       key,
		server:    server,
		cmd:       cmd,
		stdin:     stdin,
		startedAt: time.Now(),
		responses: map[int64]chan mcpStdioResponse{},
		closed:    make(chan struct{}),
	}
	go process.readStdout(stdout)
	go drainMCPStderr(server.Name, stderr)
	go process.wait()
	return process, nil
}

func (process *mcpProcess) isAlive() bool {
	select {
	case <-process.closed:
		return false
	default:
		return true
	}
}

func (process *mcpProcess) status() mcpProcessStatus {
	process.mu.Lock()
	initialized := process.initialized
	pending := len(process.responses)
	process.mu.Unlock()
	pid := 0
	if process.cmd != nil && process.cmd.Process != nil {
		pid = process.cmd.Process.Pid
	}
	return mcpProcessStatus{
		Key:             process.key,
		ID:              process.server.ID,
		Name:            process.server.Name,
		Command:         process.server.Command,
		Args:            append([]string{}, process.server.Args...),
		Cwd:             process.server.Cwd,
		PID:             pid,
		Initialized:     initialized,
		PendingRequests: pending,
		StartedAt:       process.startedAt,
	}
}

func (process *mcpProcess) ensureInitialized(ctx context.Context) error {
	process.mu.Lock()
	initialized := process.initialized
	process.mu.Unlock()
	if initialized {
		return nil
	}
	params := map[string]interface{}{
		"protocolVersion": mcpProtocolVersion,
		"capabilities":    map[string]interface{}{},
		"clientInfo": map[string]interface{}{
			"name":    "windypear-connector",
			"version": currentConnectorVersion(),
		},
	}
	if _, err := process.call(ctx, "initialize", params); err != nil {
		return err
	}
	if err := process.notify("notifications/initialized", nil); err != nil {
		return err
	}
	process.mu.Lock()
	process.initialized = true
	process.mu.Unlock()
	return nil
}

func (process *mcpProcess) call(ctx context.Context, method string, params interface{}) (json.RawMessage, error) {
	id := atomic.AddInt64(&process.idCounter, 1)
	ch := make(chan mcpStdioResponse, 1)
	process.mu.Lock()
	process.responses[id] = ch
	process.mu.Unlock()
	defer process.forgetResponse(id)

	request := mcpStdioRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params}
	if err := process.writeJSON(request); err != nil {
		return nil, err
	}
	select {
	case response := <-ch:
		if response.Err != nil {
			return nil, response.Err
		}
		if response.Error != nil {
			return nil, response.Error
		}
		if len(response.Result) == 0 {
			return nil, fmt.Errorf("mcp server returned no result for %s", method)
		}
		return response.Result, nil
	case <-process.closed:
		return nil, errors.New("mcp process exited")
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (process *mcpProcess) notify(method string, params interface{}) error {
	request := mcpStdioRequest{JSONRPC: "2.0", Method: method, Params: params}
	return process.writeJSON(request)
}

func (process *mcpProcess) writeJSON(value interface{}) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	process.writeMu.Lock()
	defer process.writeMu.Unlock()
	_, err = process.stdin.Write(raw)
	return err
}

func (process *mcpProcess) forgetResponse(id int64) {
	process.mu.Lock()
	delete(process.responses, id)
	process.mu.Unlock()
}

func (process *mcpProcess) readStdout(stdout io.Reader) {
	decoder := json.NewDecoder(stdout)
	for {
		var response mcpStdioResponse
		if err := decoder.Decode(&response); err != nil {
			if !errors.Is(err, io.EOF) {
				process.failPending(fmt.Errorf("mcp stdout decode failed: %w", err))
			}
			return
		}
		id, ok := mcpResponseID(response.ID)
		if !ok {
			continue
		}
		process.mu.Lock()
		ch := process.responses[id]
		process.mu.Unlock()
		if ch != nil {
			ch <- response
		}
	}
}

func (process *mcpProcess) wait() {
	err := process.cmd.Wait()
	if err != nil {
		process.failPending(err)
	}
	close(process.closed)
}

func (process *mcpProcess) failPending(err error) {
	process.mu.Lock()
	responses := process.responses
	process.responses = map[int64]chan mcpStdioResponse{}
	process.mu.Unlock()
	for _, ch := range responses {
		ch <- mcpStdioResponse{Err: err}
	}
}

func (process *mcpProcess) close() {
	select {
	case <-process.closed:
		return
	default:
	}
	if process.cmd != nil && process.cmd.Process != nil {
		_ = process.cmd.Process.Kill()
	}
}

func drainMCPStderr(name string, stderr io.Reader) {
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 0, 4096), mcpMaxStderrLineSize)
	label := strings.TrimSpace(name)
	if label == "" {
		label = "mcp"
	}
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			fmt.Fprintf(os.Stderr, "[%s] %s\n", label, line)
		}
	}
}

func mcpResponseID(raw json.RawMessage) (int64, bool) {
	var id int64
	if err := json.Unmarshal(raw, &id); err == nil {
		return id, true
	}
	var floatID float64
	if err := json.Unmarshal(raw, &floatID); err == nil {
		return int64(floatID), true
	}
	return 0, false
}

func mcpServerFromPayload(payload map[string]interface{}) (mcpServerConfig, error) {
	raw, ok := payload["server"]
	if !ok {
		return mcpServerConfig{}, errors.New("mcp server config is required")
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return mcpServerConfig{}, err
	}
	var server mcpServerConfig
	if err := json.Unmarshal(data, &server); err != nil {
		return mcpServerConfig{}, err
	}
	server.ID = strings.TrimSpace(server.ID)
	server.Name = strings.TrimSpace(server.Name)
	server.Command = strings.TrimSpace(server.Command)
	server.Cwd = strings.TrimSpace(server.Cwd)
	if server.Command == "" {
		return mcpServerConfig{}, errors.New("mcp command is required")
	}
	return server, nil
}

func mcpServerKey(server mcpServerConfig) string {
	data, _ := json.Marshal(server)
	sum := sha1.Sum(data)
	return hex.EncodeToString(sum[:])
}

func mapArg(payload map[string]interface{}, name string) map[string]interface{} {
	value, ok := payload[name]
	if !ok || value == nil {
		return nil
	}
	if typed, ok := value.(map[string]interface{}); ok {
		return typed
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil
	}
	return result
}
