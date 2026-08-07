package service

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

func TestValidateWorkspaceResourcesUsesRealModelAgentAndDevice(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:workspace-resources-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&model.Model{}, &model.Channel{}, &model.ModelConfig{}, &AdvancedChatAgent{}, &AdvancedChatConnectorDevice{}); err != nil {
		t.Fatalf("migrate workspace resource tables: %v", err)
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	globalModel := model.Model{ID: 1, ModelName: "workspace-model", Enabled: true}
	channel := model.Channel{ID: 1, Name: "workspace-channel", Enabled: true}
	config := model.ModelConfig{ID: 1, ModelID: globalModel.ID, ChannelID: channel.ID, UpstreamModelName: "workspace-model", Enabled: true}
	agent := AdvancedChatAgent{ID: 1, UserID: 7, Name: "Workspace agent", Prompt: "Help with documents", DefaultModel: "workspace-model", UserChannelID: channel.ID, SkillIDs: "[]", MCPServerIDs: "[]", KnowledgeBaseIDs: "[]", PresetMessages: "[]"}
	now := time.Now()
	device := AdvancedChatConnectorDevice{ID: "device-7", UserID: 7, TokenHash: "workspace-device-token", Name: "User device", Status: "online", LastSeenAt: &now, Workspaces: "[]"}
	for _, value := range []interface{}{&globalModel, &channel, &config, &agent, &device} {
		if err := db.Create(value).Error; err != nil {
			t.Fatalf("create fixture %T: %v", value, err)
		}
	}

	if err := validateWorkspaceResources(7, "server", "", "workspace-model", "1"); err != nil {
		t.Fatalf("valid server resources were rejected: %v", err)
	}
	if err := validateWorkspaceResources(7, "device", "device-7", "workspace-model", "1"); err != nil {
		t.Fatalf("valid device resources were rejected: %v", err)
	}
	if err := validateWorkspaceResources(8, "device", "device-7", "workspace-model", "1"); err == nil {
		t.Fatal("resources owned by another user must be rejected")
	}
	if err := validateWorkspaceResources(7, "server", "", "missing-model", "1"); err == nil {
		t.Fatal("unknown model must be rejected")
	}
	if err := validateWorkspaceResources(7, "server", "", "workspace-model", "999"); err == nil {
		t.Fatal("unknown agent must be rejected")
	}
}
