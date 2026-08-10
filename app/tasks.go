package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (client connectorClient) pollLoop() {
	for {
		var envelope taskEnvelope
		err := client.doJSON(http.MethodGet, "/api/advanced-chat/connectors/tasks/next", nil, &envelope)
		if err != nil {
			fmt.Printf("poll failed: %v\n", err)
			time.Sleep(3 * time.Second)
			continue
		}
		if envelope.Task == nil || envelope.Task.ID == "" {
			continue
		}
		// Terminal tasks are short-lived polls that must not queue behind a
		// long-running command, so they run alongside the poll loop.
		if isTerminalTaskAction(envelope.Task.Action) {
			task := *envelope.Task
			go client.runTask(task, false)
			continue
		}
		fmt.Printf("\nTask %s: %s\n", envelope.Task.ID, envelope.Task.Action)
		client.runTask(*envelope.Task, true)
	}
}

func (client connectorClient) runTask(task connectorTask, verbose bool) {
	result, execErr := client.executeTask(task)
	payload := result.payload(execErr == nil)
	if execErr != nil {
		payload["error"] = execErr.Error()
		fmt.Printf("Task %s failed: %v\n", task.ID, execErr)
	} else if verbose {
		fmt.Println("Task completed")
	}
	path := "/api/advanced-chat/connectors/tasks/" + task.ID + "/result"
	if err := client.doJSON(http.MethodPost, path, payload, nil); err != nil {
		fmt.Printf("result upload failed: %v\n", err)
	}
}

func isTerminalTaskAction(action string) bool {
	switch action {
	case "terminal_open", "terminal_input", "terminal_read", "terminal_resize", "terminal_close":
		return true
	default:
		return false
	}
}

type taskResult struct {
	Result   string
	Output   string
	Stdout   string
	Stderr   string
	ExitCode *int
}

func textTaskResult(text string) taskResult {
	return taskResult{Result: text}
}

func commandTaskResult(result commandResult) taskResult {
	return taskResult{
		Result:   result.Result,
		Output:   result.Output,
		Stdout:   result.Stdout,
		Stderr:   result.Stderr,
		ExitCode: result.ExitCode,
	}
}

func (result taskResult) payload(success bool) map[string]interface{} {
	payload := map[string]interface{}{
		"success": success,
		"result":  result.Result,
	}
	if result.Output != "" {
		payload["output"] = result.Output
	}
	if result.Stdout != "" {
		payload["stdout"] = result.Stdout
	}
	if result.Stderr != "" {
		payload["stderr"] = result.Stderr
	}
	if result.ExitCode != nil {
		payload["exit_code"] = *result.ExitCode
	}
	return payload
}

func (client connectorClient) executeTask(task connectorTask) (taskResult, error) {
	if client.config.Mode == connectorModeSandboxd && strings.TrimSpace(stringArg(task.Payload, "cloud_sandbox_id")) != "" {
		return client.executeSandboxdTask(task)
	}
	switch task.Action {
	case "web_search":
		result, err := webSearch(
			stringArg(task.Payload, "query"),
			intArg(task.Payload, "max_results", 5),
			stringArg(task.Payload, "language"),
			stringArg(task.Payload, "region"),
			stringArg(task.Payload, "time_range"),
			stringArg(task.Payload, "engine"),
		)
		return textTaskResult(result), err
	case "web_fetch":
		result, err := webFetch(
			stringArg(task.Payload, "url"),
			intArg(task.Payload, "max_bytes", webFetchDefaultMaxBytes),
		)
		return textTaskResult(result), err
	case "mcp_list_tools":
		if client.mcp == nil {
			return taskResult{}, fmt.Errorf("mcp manager is not available")
		}
		result, err := client.mcp.listTools(task.Payload)
		return textTaskResult(result), err
	case "mcp_call_tool":
		if client.mcp == nil {
			return taskResult{}, fmt.Errorf("mcp manager is not available")
		}
		result, err := client.mcp.callTool(task.Payload)
		return textTaskResult(result), err
	case "list_mcp_processes":
		if client.mcp == nil {
			return taskResult{}, fmt.Errorf("mcp manager is not available")
		}
		result, err := client.mcp.listProcesses()
		return textTaskResult(result), err
	case "stop_mcp_process":
		if client.mcp == nil {
			return taskResult{}, fmt.Errorf("mcp manager is not available")
		}
		result, err := client.mcp.stopProcess(stringArg(task.Payload, "key"))
		return textTaskResult(result), err
	case "terminal_open":
		if client.terminals == nil {
			return taskResult{}, fmt.Errorf("terminal manager is not available")
		}
		result, err := client.terminals.open(task.Payload)
		return textTaskResult(result), err
	case "terminal_input":
		if client.terminals == nil {
			return taskResult{}, fmt.Errorf("terminal manager is not available")
		}
		result, err := client.terminals.input(task.Payload)
		return textTaskResult(result), err
	case "terminal_read":
		if client.terminals == nil {
			return taskResult{}, fmt.Errorf("terminal manager is not available")
		}
		result, err := client.terminals.read(task.Payload)
		return textTaskResult(result), err
	case "terminal_resize":
		if client.terminals == nil {
			return taskResult{}, fmt.Errorf("terminal manager is not available")
		}
		result, err := client.terminals.resize(task.Payload)
		return textTaskResult(result), err
	case "terminal_close":
		if client.terminals == nil {
			return taskResult{}, fmt.Errorf("terminal manager is not available")
		}
		result, err := client.terminals.close(task.Payload)
		return textTaskResult(result), err
	case "list_agent_skills":
		result, err := listAgentSkills(task.WorkspacePath)
		return textTaskResult(result), err
	case "read_agent_skill":
		result, err := readAgentSkill(task.WorkspacePath, stringArg(task.Payload, "id"), stringArg(task.Payload, "path"), intArg(task.Payload, "max_bytes", 65536))
		return textTaskResult(result), err
	case "read_agent_skill_resource":
		result, err := readAgentSkillResource(task.WorkspacePath, stringArg(task.Payload, "id"), stringArg(task.Payload, "path"), stringArg(task.Payload, "resource"), intArg(task.Payload, "max_bytes", 65536))
		return textTaskResult(result), err
	case "sync_agent_skills":
		result, err := syncAgentSkills(task.Payload)
		return textTaskResult(result), err
	case "list_windows_drives":
		result, err := listWindowsDrives()
		return textTaskResult(result), err
	case "list_agent_groups":
		result, err := listAgentGroups()
		return textTaskResult(result), err
	case "read_agent_group":
		result, err := readAgentGroup(stringArg(task.Payload, "id"))
		return textTaskResult(result), err
	case "write_agent_group":
		result, err := writeAgentGroup(stringArg(task.Payload, "id"), stringArg(task.Payload, "content"))
		return textTaskResult(result), err
	case "delete_agent_group":
		result, err := deleteAgentGroup(stringArg(task.Payload, "id"))
		return textTaskResult(result), err
	}
	workspace := ""
	if strings.TrimSpace(task.WorkspacePath) != "" {
		var err error
		workspace, err = client.workspaceRoot(task.WorkspacePath)
		if err != nil {
			return taskResult{}, err
		}
	}
	sandboxID := stringArg(task.Payload, "sandbox_id")
	sandboxWorkspace := workspace
	if strings.TrimSpace(sandboxID) != "" && strings.TrimSpace(workspace) != "" && task.Action != "run_command" && task.Action != "commit_delta" {
		var err error
		sandboxWorkspace, err = prepareSandboxWorkspace(workspace, sandboxID)
		if err != nil {
			return taskResult{}, err
		}
	}
	switch task.Action {
	case "list_files":
		result, err := listFiles(sandboxWorkspace, stringArg(task.Payload, "path"), intArg(task.Payload, "max_entries", 100))
		return textTaskResult(result), err
	case "read_file":
		result, err := readFile(sandboxWorkspace, stringArg(task.Payload, "path"), intArg(task.Payload, "max_bytes", 120000))
		return textTaskResult(result), err
	case "file_sha256":
		result, err := fileSHA256(sandboxWorkspace, stringArg(task.Payload, "path"))
		return textTaskResult(result), err
	case "write_file":
		result, err := writeFile(sandboxWorkspace, stringArg(task.Payload, "path"), stringArg(task.Payload, "content"), boolArg(task.Payload, "overwrite"), boolArg(task.Payload, "create_dirs"))
		return textTaskResult(result), err
	case "replace_text":
		result, err := replaceText(sandboxWorkspace, stringArg(task.Payload, "path"), stringArg(task.Payload, "old_text"), stringArg(task.Payload, "new_text"))
		return textTaskResult(result), err
	case "commit_delta":
		result, err := commitDelta(workspace, task.Payload)
		return textTaskResult(result), err
	case "run_command":
		result, err := runCommandWithSandbox(workspace, stringArg(task.Payload, "command"), intArg(task.Payload, "timeout_sec", 30), sandboxCommandOptions{
			SandboxID: stringArg(task.Payload, "sandbox_id"),
			Backend:   stringArg(task.Payload, "sandbox_backend"),
		})
		return commandTaskResult(result), err
	default:
		return taskResult{}, fmt.Errorf("unsupported action %q", task.Action)
	}
}

func (client connectorClient) executeSandboxdTask(task connectorTask) (taskResult, error) {
	if task.Action == "cleanup_cloud_sandbox" {
		result, err := client.cleanupSandboxdWorkspace(stringArg(task.Payload, "cloud_sandbox_id"))
		return textTaskResult(result), err
	}
	workspace, err := client.sandboxdWorkspace(stringArg(task.Payload, "cloud_sandbox_id"))
	if err != nil {
		return taskResult{}, err
	}
	switch task.Action {
	case "list_files":
		result, err := listFiles(workspace, stringArg(task.Payload, "path"), intArg(task.Payload, "max_entries", 100))
		return textTaskResult(result), err
	case "read_file":
		result, err := readFile(workspace, stringArg(task.Payload, "path"), intArg(task.Payload, "max_bytes", 120000))
		return textTaskResult(result), err
	case "file_sha256":
		result, err := fileSHA256(workspace, stringArg(task.Payload, "path"))
		return textTaskResult(result), err
	case "write_file":
		result, err := writeFile(workspace, stringArg(task.Payload, "path"), stringArg(task.Payload, "content"), boolArg(task.Payload, "overwrite"), boolArg(task.Payload, "create_dirs"))
		return textTaskResult(result), err
	case "replace_text":
		result, err := replaceText(workspace, stringArg(task.Payload, "path"), stringArg(task.Payload, "old_text"), stringArg(task.Payload, "new_text"))
		return textTaskResult(result), err
	case "run_command":
		spec, err := sandboxdSpecFromTask(task.Payload)
		if err != nil {
			return taskResult{}, err
		}
		result, err := runSandboxdCommand(workspace, stringArg(task.Payload, "command"), intArg(task.Payload, "timeout_sec", 30), spec)
		return commandTaskResult(result), err
	default:
		return taskResult{}, fmt.Errorf("sandboxd does not allow action %q", task.Action)
	}
}
