package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"runtime"
	"strings"
	"time"
)

func (client connectorClient) register() error {
	version := currentConnectorVersion()
	payload := map[string]interface{}{
		"hostname":            hostname(),
		"os":                  runtime.GOOS,
		"arch":                runtime.GOARCH,
		"version":             version,
		"mode":                client.config.Mode,
		"listen_port":         client.config.ListenPort,
		"kind":                client.config.Kind,
		"desktop_instance_id": client.config.DesktopInstanceID,
	}
	if client.config.Kind != connectorDeviceKindDesktop {
		payload["name"] = client.config.Name
	}
	var response map[string]interface{}
	return client.doJSON(http.MethodPost, "/api/advanced-chat/connectors/register", payload, &response)
}

func (client connectorClient) heartbeatLoop() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		version := currentConnectorVersion()
		payload := map[string]interface{}{
			"hostname":            hostname(),
			"os":                  runtime.GOOS,
			"arch":                runtime.GOARCH,
			"version":             version,
			"mode":                client.config.Mode,
			"listen_port":         client.config.ListenPort,
			"kind":                client.config.Kind,
			"desktop_instance_id": client.config.DesktopInstanceID,
		}
		if client.config.Kind != connectorDeviceKindDesktop {
			payload["name"] = client.config.Name
		}
		if err := client.doJSON(http.MethodPost, "/api/advanced-chat/connectors/heartbeat", payload, nil); err != nil {
			fmt.Printf("heartbeat failed: %v\n", err)
		}
	}
}

func (client connectorClient) doJSON(method string, path string, payload interface{}, out interface{}) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, client.config.Server+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+client.config.Token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	if out != nil && len(respBody) > 0 {
		return json.Unmarshal(respBody, out)
	}
	return nil
}
