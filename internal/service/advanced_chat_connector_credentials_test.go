package service

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

func TestConnectorCredentialsAttachOnlyToMatchingActions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:connector-credentials-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&AdvancedChatConnectorCredential{}, &AdvancedChatConnectorCredentialBinding{}); err != nil {
		t.Fatalf("migrate credential tables: %v", err)
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
	credentials := []AdvancedChatConnectorCredential{
		{ID: "credential-env", UserID: 7, Name: "Deployment token", Type: connectorCredentialTypeEnvironment, Key: "DEPLOY_TOKEN", Value: "env-secret"},
		{ID: "credential-header", UserID: 7, Name: "API authorization", Type: connectorCredentialTypeHTTPHeader, Key: "Authorization", Value: "Bearer header-secret"},
	}
	if err := db.Create(&credentials).Error; err != nil {
		t.Fatalf("create credentials: %v", err)
	}
	bindings := []AdvancedChatConnectorCredentialBinding{
		{ID: "binding-env", UserID: 7, DeviceID: "device-a", CredentialID: "credential-env"},
		{ID: "binding-header", UserID: 7, DeviceID: "device-a", CredentialID: "credential-header"},
	}
	if err := db.Create(&bindings).Error; err != nil {
		t.Fatalf("create bindings: %v", err)
	}

	command, err := attachConnectorCredentials(7, "device-a", "run_command", map[string]interface{}{"command": "deploy"})
	if err != nil {
		t.Fatalf("attach command credentials: %v", err)
	}
	environment, ok := command["environment"].(map[string]string)
	if !ok || environment["DEPLOY_TOKEN"] != "env-secret" || command["headers"] != nil {
		t.Fatalf("unexpected command credentials: %#v", command)
	}

	fetch, err := attachConnectorCredentials(7, "device-a", "web_fetch", map[string]interface{}{"url": "https://example.com"})
	if err != nil {
		t.Fatalf("attach HTTP credentials: %v", err)
	}
	headers, ok := fetch["headers"].(map[string]string)
	if !ok || headers["Authorization"] != "Bearer header-secret" || fetch["environment"] != nil {
		t.Fatalf("unexpected HTTP credentials: %#v", fetch)
	}
	redacted := stripAdvancedChatConnectorPreviewFields(fetch)
	if values, ok := redacted["headers"].(map[string]string); !ok || values["Authorization"] != "********" {
		t.Fatalf("credential headers were not redacted: %#v", redacted)
	}
}
