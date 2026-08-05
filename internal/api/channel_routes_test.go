package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

func TestListChannelModelsLoadsGroupMultipliers(t *testing.T) {
	previousDB := model.DB
	t.Cleanup(func() { model.DB = previousDB })

	database, err := gorm.Open(sqlite.Open("file:channel-model-routes-test?mode=memory&cache=shared"), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.AutoMigrate(&model.Channel{}, &model.Model{}, &model.ModelConfig{}, &model.Group{}, &model.ModelGroupMultiplier{}); err != nil {
		t.Fatal(err)
	}
	model.DB = database

	channel := model.Channel{Name: "upstream", Type: "openai", BaseURL: "https://api.example.com", APIKey: "key", Multiplier: decimal.NewFromInt(1), Enabled: true}
	if err := database.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	modelItem := model.Model{ModelName: "gpt-test", Provider: "openai", Enabled: true}
	if err := database.Create(&modelItem).Error; err != nil {
		t.Fatal(err)
	}
	config := model.ModelConfig{ChannelID: channel.ID, ModelID: modelItem.ID, UpstreamModelName: "gpt-test", Enabled: true}
	if err := database.Create(&config).Error; err != nil {
		t.Fatal(err)
	}
	group := model.Group{Name: "test-group", Multiplier: decimal.NewFromInt(1)}
	if err := database.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.Create(&model.ModelGroupMultiplier{ModelConfigID: config.ID, GroupID: group.ID, Multiplier: decimal.RequireFromString("1.2")}).Error; err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/channels/1/models", nil)
	context.Params = gin.Params{{Key: "id", Value: "1"}}
	(&ModelAPI{}).ListChannelModels(context)

	if response.Code != http.StatusOK {
		t.Fatalf("list channel models: status=%d body=%s", response.Code, response.Body.String())
	}
	var configs []model.ModelConfig
	if err := json.Unmarshal(response.Body.Bytes(), &configs); err != nil {
		t.Fatal(err)
	}
	if len(configs) != 1 || configs[0].ModelName != "gpt-test" || len(configs[0].GroupMultipliers) != 1 {
		t.Fatalf("unexpected model config response: %+v", configs)
	}
}

func TestPublicSettingsUseFixedVeloceBrandAndEnableMessageChannelsByDefault(t *testing.T) {
	previousDB := model.DB
	t.Cleanup(func() { model.DB = previousDB })

	database, err := gorm.Open(sqlite.Open("file:fixed-public-settings-test?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	model.DB = database
	if err := model.SetSystemSetting("site_name", "Legacy name"); err != nil {
		t.Fatal(err)
	}
	if err := model.SetSystemSetting("icon_url", "https://example.com/icon.png"); err != nil {
		t.Fatal(err)
	}

	settings := currentPublicSystemSettings()
	if settings.SiteName != "Veloce" || settings.IconURL != "" || !settings.MessageChannelEnabled {
		t.Fatalf("unexpected fixed public settings: %+v", settings)
	}
}
