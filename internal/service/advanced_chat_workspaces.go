package service

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

type AdvancedChatWorkspace struct {
	ID        string    `gorm:"primaryKey;size:80" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	Name      string    `gorm:"size:160;not null" json:"name"`
	Location  string    `gorm:"size:20;not null;default:'server'" json:"location"`
	DeviceID  string    `gorm:"size:120;not null;default:''" json:"device_id,omitempty"`
	Path      string    `gorm:"type:text;not null" json:"path"`
	Model     string    `gorm:"size:120;not null;default:''" json:"model"`
	Agent     string    `gorm:"size:120;not null;default:''" json:"agent"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AdvancedChatWorkspaceFile struct {
	ID          string    `gorm:"primaryKey;size:80" json:"id"`
	WorkspaceID string    `gorm:"index;uniqueIndex:idx_advanced_chat_workspace_file_name;not null" json:"workspace_id"`
	UserID      uint      `gorm:"index;not null" json:"user_id"`
	Name        string    `gorm:"size:255;uniqueIndex:idx_advanced_chat_workspace_file_name;not null" json:"name"`
	Content     string    `gorm:"type:text;not null" json:"content"`
	StoragePath string    `gorm:"type:text;not null;default:''" json:"-"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (api *advancedChatAPI) listWorkspaces(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var workspaces []AdvancedChatWorkspace
	if err := model.DB.Where("user_id = ?", user.ID).Order("updated_at DESC").Find(&workspaces).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list workspaces"})
		return
	}
	result := make([]gin.H, 0, len(workspaces))
	for _, workspace := range workspaces {
		var files []AdvancedChatWorkspaceFile
		if err := model.DB.Where("workspace_id = ? AND user_id = ?", workspace.ID, user.ID).Order("updated_at DESC").Find(&files).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list workspace files"})
			return
		}
		result = append(result, workspaceResponse(workspace, files))
	}
	c.JSON(http.StatusOK, gin.H{"workspaces": result})
}

type workspaceInput struct {
	Name     string `json:"name"`
	Location string `json:"location"`
	DeviceID string `json:"device_id"`
	Path     string `json:"path"`
	Model    string `json:"model"`
	Agent    string `json:"agent"`
}

func (api *advancedChatAPI) createWorkspace(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input workspaceInput
	if c.ShouldBindJSON(&input) != nil || strings.TrimSpace(input.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	location := strings.TrimSpace(input.Location)
	if location != "server" && location != "device" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace location"})
		return
	}
	if err := validateWorkspaceResources(user.ID, location, input.DeviceID, input.Model, input.Agent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	workspace := AdvancedChatWorkspace{ID: newAdvancedChatID("acw"), UserID: user.ID, Name: strings.TrimSpace(input.Name), Location: location, DeviceID: strings.TrimSpace(input.DeviceID), Path: strings.TrimSpace(input.Path), Model: strings.TrimSpace(input.Model), Agent: strings.TrimSpace(input.Agent)}
	if location == "server" {
		workspace.DeviceID = ""
	}
	if workspace.Path == "" {
		if location == "device" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "device path is required"})
			return
		}
		workspace.Path = "/workspaces/" + strings.ToLower(strings.ReplaceAll(workspace.Name, " ", "-"))
	}
	file := AdvancedChatWorkspaceFile{ID: newAdvancedChatID("acwf"), WorkspaceID: workspace.ID, UserID: user.ID, Name: "欢迎使用.md", Content: "# " + workspace.Name + "\n\n这是你的新工作区，开始记录想法吧。\n"}
	if err := persistWorkspaceFile(c.Request.Context(), user.ID, workspace, &file, nil); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to initialize workspace storage: " + err.Error()})
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&workspace).Error; err != nil {
			return err
		}
		return tx.Create(&file).Error
	}); err != nil {
		_ = removeWorkspaceFileStorage(c.Request.Context(), user.ID, workspace, file)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create workspace"})
		return
	}
	c.JSON(http.StatusCreated, workspaceResponse(workspace, []AdvancedChatWorkspaceFile{file}))
}

func (api *advancedChatAPI) updateWorkspace(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input workspaceInput
	if c.ShouldBindJSON(&input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	var workspace AdvancedChatWorkspace
	if err := model.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&workspace).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load workspace"})
		}
		return
	}
	nextLocation := workspace.Location
	if input.Location != "" {
		nextLocation = strings.TrimSpace(input.Location)
		if nextLocation != "server" && nextLocation != "device" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid workspace location"})
			return
		}
	}
	nextDeviceID := workspace.DeviceID
	if input.DeviceID != "" || nextLocation == "server" {
		nextDeviceID = strings.TrimSpace(input.DeviceID)
	}
	nextModel := workspace.Model
	if input.Model != "" {
		nextModel = strings.TrimSpace(input.Model)
	}
	nextAgent := workspace.Agent
	if input.Agent != "" {
		nextAgent = strings.TrimSpace(input.Agent)
	}
	if err := validateWorkspaceResources(user.ID, nextLocation, nextDeviceID, nextModel, nextAgent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if nextLocation != workspace.Location || nextDeviceID != workspace.DeviceID || (input.Path != "" && strings.TrimSpace(input.Path) != workspace.Path) {
		c.JSON(http.StatusConflict, gin.H{"error": "workspace storage location cannot be changed after creation"})
		return
	}
	updates := map[string]interface{}{}
	if strings.TrimSpace(input.Name) != "" {
		updates["name"] = strings.TrimSpace(input.Name)
	}
	if input.Location != "" {
		updates["location"] = nextLocation
	}
	if input.DeviceID != "" || nextLocation == "server" {
		updates["device_id"] = nextDeviceID
	}
	if input.Path != "" {
		updates["path"] = input.Path
	}
	if input.Model != "" {
		updates["model"] = input.Model
	}
	if input.Agent != "" {
		updates["agent"] = input.Agent
	}
	if err := model.DB.Model(&workspace).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update workspace"})
		return
	}
	model.DB.First(&workspace, "id = ?", workspace.ID)
	var files []AdvancedChatWorkspaceFile
	model.DB.Where("workspace_id = ? AND user_id = ?", workspace.ID, user.ID).Find(&files)
	c.JSON(http.StatusOK, workspaceResponse(workspace, files))
}

func (api *advancedChatAPI) deleteWorkspace(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var workspace AdvancedChatWorkspace
	if err := model.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&workspace).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load workspace"})
		}
		return
	}
	var files []AdvancedChatWorkspaceFile
	if err := model.DB.Where("workspace_id = ? AND user_id = ?", workspace.ID, user.ID).Find(&files).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load workspace files"})
		return
	}
	for _, file := range files {
		if err := removeWorkspaceFileStorage(c.Request.Context(), user.ID, workspace, file); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to remove workspace storage: " + err.Error()})
			return
		}
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("workspace_id = ? AND user_id = ?", workspace.ID, user.ID).Delete(&AdvancedChatWorkspaceFile{}).Error; err != nil {
			return err
		}
		return tx.Delete(&workspace).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete workspace"})
		return
	}
	c.Status(http.StatusNoContent)
}

type workspaceFileInput struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

func (api *advancedChatAPI) loadWorkspace(c *gin.Context) (*model.User, *AdvancedChatWorkspace, bool) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return nil, nil, false
	}
	var workspace AdvancedChatWorkspace
	if err := model.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&workspace).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load workspace"})
		}
		return nil, nil, false
	}
	return user, &workspace, true
}
func (api *advancedChatAPI) createWorkspaceFile(c *gin.Context) {
	user, workspace, ok := api.loadWorkspace(c)
	if !ok {
		return
	}
	var input workspaceFileInput
	if c.ShouldBindJSON(&input) != nil || strings.TrimSpace(input.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	name, err := normalizeWorkspaceFileName(input.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len([]byte(input.Content)) > 2<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file content exceeds 2 MiB"})
		return
	}
	file := AdvancedChatWorkspaceFile{ID: newAdvancedChatID("acwf"), WorkspaceID: workspace.ID, UserID: user.ID, Name: name, Content: input.Content}
	if err := persistWorkspaceFile(c.Request.Context(), user.ID, *workspace, &file, nil); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to write workspace file: " + err.Error()})
		return
	}
	if err := model.DB.Create(&file).Error; err != nil {
		_ = removeWorkspaceFileStorage(c.Request.Context(), user.ID, *workspace, file)
		if isAdvancedChatUniqueConstraintError(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "A file with this name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create file"})
		return
	}
	c.JSON(http.StatusCreated, file)
}
func (api *advancedChatAPI) updateWorkspaceFile(c *gin.Context) {
	user, workspace, ok := api.loadWorkspace(c)
	if !ok {
		return
	}
	var input workspaceFileInput
	if c.ShouldBindJSON(&input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	var file AdvancedChatWorkspaceFile
	if model.DB.Where("id = ? AND workspace_id = ? AND user_id = ?", c.Param("file_id"), workspace.ID, user.ID).First(&file).Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}
	if len([]byte(input.Content)) > 2<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file content exceeds 2 MiB"})
		return
	}
	previous := file
	file.Content = input.Content
	if strings.TrimSpace(input.Name) != "" {
		name, err := normalizeWorkspaceFileName(input.Name)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		file.Name = name
	}
	if err := persistWorkspaceFile(c.Request.Context(), user.ID, *workspace, &file, &previous); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to write workspace file: " + err.Error()})
		return
	}
	if err := model.DB.Model(&previous).Updates(map[string]interface{}{"name": file.Name, "content": file.Content, "storage_path": file.StoragePath}).Error; err != nil {
		if isAdvancedChatUniqueConstraintError(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "A file with this name already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update file"})
		return
	}
	model.DB.First(&file, "id = ?", file.ID)
	c.JSON(http.StatusOK, file)
}
func (api *advancedChatAPI) deleteWorkspaceFile(c *gin.Context) {
	user, workspace, ok := api.loadWorkspace(c)
	if !ok {
		return
	}
	var file AdvancedChatWorkspaceFile
	if err := model.DB.Where("id = ? AND workspace_id = ? AND user_id = ?", c.Param("file_id"), workspace.ID, user.ID).First(&file).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}
	if err := removeWorkspaceFileStorage(c.Request.Context(), user.ID, *workspace, file); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to remove workspace file: " + err.Error()})
		return
	}
	if err := model.DB.Delete(&file).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete file"})
		return
	}
	c.Status(http.StatusNoContent)
}

func workspaceResponse(workspace AdvancedChatWorkspace, files []AdvancedChatWorkspaceFile) gin.H {
	return gin.H{"id": workspace.ID, "name": workspace.Name, "location": workspace.Location, "device_id": workspace.DeviceID, "path": workspace.Path, "model": workspace.Model, "agent_id": workspace.Agent, "created_at": workspace.CreatedAt, "updated_at": workspace.UpdatedAt, "files": files}
}

func validateWorkspaceResources(userID uint, location, deviceID, modelName, agentID string) error {
	modelName = strings.TrimSpace(modelName)
	agentID = strings.TrimSpace(agentID)
	if modelName == "" {
		return errors.New("AI model is required")
	}
	var modelCount int64
	if err := model.DB.Table("models").
		Joins("JOIN model_configs ON model_configs.model_id = models.id AND model_configs.enabled = ?", true).
		Joins("JOIN channels ON channels.id = model_configs.channel_id AND channels.enabled = ?", true).
		Where("models.model_name = ? AND models.enabled = ?", modelName, true).
		Count(&modelCount).Error; err != nil || modelCount == 0 {
		return errors.New("selected AI model is not available")
	}
	if agentID == "" {
		return errors.New("agent is required")
	}
	agent, err := loadAdvancedChatAgent(userID, agentID)
	if err != nil || agent == nil {
		return errors.New("selected agent is not available")
	}
	if location == "device" {
		deviceID = strings.TrimSpace(deviceID)
		if deviceID == "" {
			return errors.New("device is required")
		}
		if _, _, err := loadAdvancedChatConnectorForRun(userID, deviceID, ""); err != nil {
			return errors.New("selected device is offline or unavailable")
		}
	}
	if agent.UserChannelID > 0 {
		var compatible int64
		if err := model.DB.Table("model_configs").
			Joins("JOIN models ON models.id = model_configs.model_id AND models.enabled = ?", true).
			Joins("JOIN channels ON channels.id = model_configs.channel_id AND channels.enabled = ?", true).
			Where("models.model_name = ? AND model_configs.enabled = ? AND channels.id = ?", modelName, true, agent.UserChannelID).
			Count(&compatible).Error; err != nil || compatible == 0 {
			return errors.New("selected model is not available on the agent channel")
		}
	}
	return nil
}

func normalizeWorkspaceFileName(value string) (string, error) {
	name := strings.TrimSpace(value)
	if name == "" {
		return "", errors.New("file name is required")
	}
	if strings.ContainsAny(name, "/\\\x00") || name == "." || name == ".." || len([]rune(name)) > 255 {
		return "", errors.New("invalid file name")
	}
	if !strings.HasSuffix(strings.ToLower(name), ".md") {
		name += ".md"
	}
	return name, nil
}

func workspaceServerStoragePath(userID uint, workspaceID string, fileName string) string {
	return path.Join("advanced-chat", "workspaces", strconv.FormatUint(uint64(userID), 10), workspaceID, fileName)
}

func persistWorkspaceFile(ctx context.Context, userID uint, workspace AdvancedChatWorkspace, file *AdvancedChatWorkspaceFile, previous *AdvancedChatWorkspaceFile) error {
	if file == nil {
		return errors.New("workspace file is required")
	}
	if workspace.Location == "server" {
		storagePath := workspaceServerStoragePath(userID, workspace.ID, file.Name)
		temp, err := writeAdvancedChatStorageFileTemp(storagePath, []byte(file.Content))
		if err != nil {
			return err
		}
		target, err := advancedChatStorageAbsPath(storagePath)
		if err != nil {
			_ = os.Remove(temp)
			return err
		}
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			_ = os.Remove(temp)
			return err
		}
		if err := commitAdvancedChatStorageFile(temp, storagePath); err != nil {
			return err
		}
		file.StoragePath = storagePath
		if previous != nil && previous.StoragePath != "" && previous.StoragePath != storagePath {
			_ = removeAdvancedChatStoragePath(previous.StoragePath)
		}
		return nil
	}
	device, workspacePath, err := loadAdvancedChatConnectorForRun(userID, workspace.DeviceID, workspace.Path)
	if err != nil || device == nil {
		return errors.New("connector device is offline or unavailable")
	}
	callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	_, err = callAdvancedChatConnectorTool(callCtx, userID, "", advancedChatConnectorToolBinding{
		DeviceID:      workspace.DeviceID,
		DeviceName:    device.Name,
		WorkspacePath: workspacePath,
		Action:        "write_file",
		ApprovalMode:  advancedChatConnectorApprovalFullAccess,
		AutoApprove:   true,
	}, map[string]interface{}{
		"path":        file.Name,
		"content":     file.Content,
		"overwrite":   true,
		"create_dirs": true,
	})
	if err != nil {
		return err
	}
	if previous != nil && previous.Name != file.Name {
		return deleteWorkspaceDeviceFile(callCtx, userID, workspace, previous.Name)
	}
	return nil
}

func removeWorkspaceFileStorage(ctx context.Context, userID uint, workspace AdvancedChatWorkspace, file AdvancedChatWorkspaceFile) error {
	if workspace.Location == "server" {
		return removeAdvancedChatStoragePath(file.StoragePath)
	}
	return deleteWorkspaceDeviceFile(ctx, userID, workspace, file.Name)
}

func deleteWorkspaceDeviceFile(ctx context.Context, userID uint, workspace AdvancedChatWorkspace, fileName string) error {
	device, workspacePath, err := loadAdvancedChatConnectorForRun(userID, workspace.DeviceID, workspace.Path)
	if err != nil || device == nil {
		return errors.New("connector device is offline or unavailable")
	}
	callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	_, err = callAdvancedChatConnectorTool(callCtx, userID, "", advancedChatConnectorToolBinding{
		DeviceID:      workspace.DeviceID,
		DeviceName:    device.Name,
		WorkspacePath: workspacePath,
		Action:        "commit_delta",
		ApprovalMode:  advancedChatConnectorApprovalFullAccess,
		AutoApprove:   true,
	}, map[string]interface{}{"mutations": []map[string]interface{}{{"action": "delete_file", "path": fileName}}})
	return err
}

type workspaceAIInput struct {
	Action    string `json:"action"`
	Content   string `json:"content"`
	Selection string `json:"selection"`
}

func (api *advancedChatAPI) runWorkspaceAI(c *gin.Context) {
	user, workspace, ok := api.loadWorkspace(c)
	if !ok {
		return
	}
	var input workspaceAIInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "document content is required"})
		return
	}
	if len([]rune(content)) > 100000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "document content is too long"})
		return
	}
	agent, err := loadAdvancedChatAgent(user.ID, workspace.Agent)
	if err != nil || agent == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "configured agent is not available"})
		return
	}
	action := strings.TrimSpace(input.Action)
	instruction := map[string]string{
		"polish":  "Polish the Markdown document. Preserve its meaning and Markdown structure. Return only the complete revised Markdown.",
		"outline": "Create a useful outline based on the Markdown document. Return only the Markdown outline to append.",
		"summary": "Summarize the Markdown document into key conclusions and action items. Return only the Markdown summary to append.",
	}[action]
	if instruction == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported AI action"})
		return
	}
	selection := strings.TrimSpace(input.Selection)
	if len([]rune(selection)) > 20000 || (selection != "" && !strings.Contains(content, selection)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document selection"})
		return
	}
	if selection != "" {
		instruction += " Focus on this selected text: " + selection
	}
	skills, err := loadAdvancedChatSkills(user.ID, decodeStringList(agent.SkillIDs))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load configured agent skills"})
		return
	}
	systemPrompt := buildAdvancedChatCompletionSystemPrompt(agent, skills, nil, advancedChatModeChat)
	knowledgeContext, err := advancedChatKnowledgeContext(c.Request.Context(), c, user, decodeStringList(agent.KnowledgeBaseIDs), []advancedChatCompletionMessage{{Role: "user", Content: content}})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(knowledgeContext) != "" {
		systemPrompt = strings.TrimSpace(systemPrompt + "\n\n" + knowledgeContext)
	}
	messages := advancedChatPresetExecutorMessages(agent.Presets)
	messages = append(messages, ChatExecutorMessage{Role: "user", Content: instruction + "\n\n<document>\n" + content + "\n</document>"})
	result, err := ExecuteServerChatCompletion(c, user, ChatExecutorRequest{
		Context:       c.Request.Context(),
		ModelName:     workspace.Model,
		UserChannelID: agent.UserChannelID,
		System:        systemPrompt,
		Messages:      messages,
		MaxTokens:     4096,
	})
	if err != nil {
		writeAdvancedChatCompletionError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"content": result.Content, "cost": result.Cost})
}
