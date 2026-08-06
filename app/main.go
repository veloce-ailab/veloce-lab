package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

var connectorVersion = "dev"

type connectorConfig struct {
	Server            string
	Token             string
	Name              string
	Mode              string
	ListenPort        int
	DataDir           string
	Kind              string
	DesktopInstanceID string
}

type connectorClient struct {
	config      connectorConfig
	http        *http.Client
	siteManager *staticSiteManager
	mcp         *mcpProcessManager
	terminals   *terminalManager
}

func main() {
	server := flag.String("server", "http://localhost:8080", "Backend server URL")
	token := flag.String("token", "", "Connector token generated from agent chat")
	name := flag.String("name", "", "Device name shown in agent chat")
	mode := flag.String("mode", "platform", "Connector mode: platform, web_server, or sandboxd")
	webPort := flag.Int("web-port", 8080, "Static website server port in web_server mode")
	dataDir := flag.String("data-dir", "", "Connector data directory")
	deviceKind := flag.String("device-kind", "cli", "Connector device kind: cli or desktop")
	desktopInstanceID := flag.String("desktop-instance-id", "", "Veloce Desktop installation id")
	flag.Parse()

	if strings.TrimSpace(*token) == "" {
		fatalf("missing -token")
	}
	hostname, _ := os.Hostname()
	deviceName := strings.TrimSpace(*name)
	if deviceName == "" {
		deviceName = hostname
	}
	config := connectorConfig{
		Server:            strings.TrimRight(strings.TrimSpace(*server), "/"),
		Token:             strings.TrimSpace(*token),
		Name:              deviceName,
		Mode:              normalizeConnectorMode(*mode),
		ListenPort:        normalizeListenPort(*webPort, *mode),
		DataDir:           strings.TrimSpace(*dataDir),
		Kind:              normalizeConnectorDeviceKind(*deviceKind),
		DesktopInstanceID: strings.TrimSpace(*desktopInstanceID),
	}
	client := connectorClient{
		config:    config,
		http:      &http.Client{Timeout: 35 * time.Second},
		mcp:       newMCPProcessManager(),
		terminals: newTerminalManager(),
	}
	if client.config.Mode == connectorModeWebServer {
		manager, err := newStaticSiteManager(client.config.DataDir)
		if err != nil {
			fatalf("static site manager failed: %v", err)
		}
		client.siteManager = manager
		go func() {
			if err := manager.serve(client.config.ListenPort); err != nil {
				fatalf("web server failed: %v", err)
			}
		}()
	}
	if err := client.register(); err != nil {
		fatalf("register failed: %v", err)
	}
	if client.config.Mode == connectorModeWebServer {
		fmt.Printf("Connector online as %q in web_server mode on port %d\n", deviceName, client.config.ListenPort)
	} else {
		fmt.Printf("Connector online as %q\n", deviceName)
	}
	go client.heartbeatLoop()
	client.pollLoop()
}

const (
	connectorDeviceKindCLI     = "cli"
	connectorDeviceKindDesktop = "desktop"
)

func normalizeConnectorDeviceKind(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), connectorDeviceKindDesktop) {
		return connectorDeviceKindDesktop
	}
	return connectorDeviceKindCLI
}

func fatalf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func currentConnectorVersion() string {
	if version := strings.TrimSpace(os.Getenv("VELOCE_CONNECTOR_VERSION")); version != "" {
		return version
	}
	return connectorVersion
}

const (
	connectorModePlatform  = "platform"
	connectorModeWebServer = "web_server"
	connectorModeSandboxd  = "sandboxd"
)

func normalizeConnectorMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case connectorModeWebServer:
		return connectorModeWebServer
	case connectorModeSandboxd:
		return connectorModeSandboxd
	default:
		return connectorModePlatform
	}
}

func normalizeListenPort(port int, mode string) int {
	if normalizeConnectorMode(mode) != connectorModeWebServer {
		return 0
	}
	if port <= 0 || port > 65535 {
		return 8080
	}
	return port
}
