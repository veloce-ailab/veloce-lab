package main

import "time"

type taskEnvelope struct {
	Task *connectorTask `json:"task"`
}

type connectorTask struct {
	ID            string                 `json:"id"`
	Action        string                 `json:"action"`
	WorkspacePath string                 `json:"workspace_path"`
	Payload       map[string]interface{} `json:"payload"`
	CreatedAt     time.Time              `json:"created_at"`
}

func stringArg(payload map[string]interface{}, name string) string {
	if value, ok := payload[name].(string); ok {
		return value
	}
	return ""
}

func intArg(payload map[string]interface{}, name string, fallback int) int {
	switch value := payload[name].(type) {
	case float64:
		return int(value)
	case int:
		return value
	default:
		return fallback
	}
}

func boolArg(payload map[string]interface{}, name string) bool {
	value, _ := payload[name].(bool)
	return value
}
