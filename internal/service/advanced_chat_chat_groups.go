package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

const (
	chatGroupMemberIdle      = "idle"
	chatGroupMemberWorking   = "working"
	chatGroupSenderUser      = "user"
	chatGroupSenderAgent     = "agent"
	chatGroupMaxMessageDepth = 8
	chatGroupPostToolName    = "send_group_message"
)

type AdvancedChatChatGroup struct {
	ID          string                        `gorm:"primaryKey;size:80" json:"id"`
	UserID      uint                          `gorm:"index;not null" json:"-"`
	Name        string                        `gorm:"size:120;not null" json:"name"`
	Description string                        `gorm:"type:text;not null" json:"description"`
	CreatedAt   time.Time                     `json:"created_at"`
	UpdatedAt   time.Time                     `json:"updated_at"`
	Members     []AdvancedChatChatGroupMember `gorm:"foreignKey:GroupID" json:"members,omitempty"`
}

type AdvancedChatChatGroupMember struct {
	ID        string    `gorm:"primaryKey;size:80" json:"id"`
	GroupID   string    `gorm:"uniqueIndex:idx_chat_group_agent;size:80;not null" json:"group_id"`
	UserID    uint      `gorm:"index;not null" json:"-"`
	AgentID   string    `gorm:"uniqueIndex:idx_chat_group_agent;size:80;not null" json:"agent_id"`
	AgentName string    `gorm:"size:100;not null" json:"agent_name"`
	SessionID string    `gorm:"size:80;index" json:"session_id,omitempty"`
	RunID     string    `gorm:"size:80;index" json:"run_id,omitempty"`
	Status    string    `gorm:"size:20;index;not null;default:'idle'" json:"status"`
	WorkDepth int       `gorm:"not null;default:0" json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AdvancedChatChatGroupMessage struct {
	ID               string    `gorm:"primaryKey;size:80" json:"id"`
	GroupID          string    `gorm:"index;size:80;not null" json:"group_id"`
	UserID           uint      `gorm:"index;not null" json:"-"`
	SenderType       string    `gorm:"size:20;not null" json:"sender_type"`
	SenderID         string    `gorm:"size:80" json:"sender_id,omitempty"`
	SenderName       string    `gorm:"size:100;not null" json:"sender_name"`
	Content          string    `gorm:"type:text;not null" json:"content"`
	MentionMemberIDs string    `gorm:"type:text;not null;default:'[]'" json:"-"`
	Depth            int       `gorm:"not null;default:0" json:"-"`
	SourceRunID      string    `gorm:"size:80;index" json:"-"`
	CreatedAt        time.Time `json:"created_at"`
	Mentions         []string  `gorm:"-" json:"mention_member_ids"`
}

type chatGroupInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	AgentIDs    []string `json:"agent_ids"`
}

type chatGroupMessageInput struct {
	Content          string   `json:"content"`
	MentionMemberIDs []string `json:"mention_member_ids"`
}

func init() {
	RegisterAdvancedChatRuntimeExtensionHook(chatGroupRuntimeExtension)
	RegisterAdvancedChatToolHandler(chatGroupPostToolName, handleChatGroupPostTool)
}

func chatGroupRuntimeExtension(_ context.Context, input AdvancedChatRuntimeContext) (AdvancedChatRuntimeExtension, error) {
	if input.Mode == advancedChatModeChat || strings.TrimSpace(input.SessionID) == "" {
		return AdvancedChatRuntimeExtension{}, nil
	}
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("session_id = ? AND user_id = ?", input.SessionID, input.UserID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return AdvancedChatRuntimeExtension{}, nil
		}
		return AdvancedChatRuntimeExtension{}, err
	}
	return AdvancedChatRuntimeExtension{
		SystemPrompt: "Group messaging rule: your normal assistant text is private work output and is never posted to the group. If and only if you have a useful message for the group, call send_group_message once with the concise message. Do not call it for internal reasoning, progress narration, acknowledgements, or irrelevant work. If the group message does not concern you, do not call the tool.",
		Tools: []ChatExecutorTool{{
			Name:        chatGroupPostToolName,
			Description: "Post one deliberate message to the current chat group. This is the only way your output becomes visible in the group and notifies other assistants.",
			Schema: map[string]interface{}{
				"type":     "object",
				"required": []string{"content"},
				"properties": map[string]interface{}{
					"content": map[string]interface{}{"type": "string", "description": "Concise, complete group message worth notifying other assistants about."},
				},
			},
		}},
	}, nil
}

func handleChatGroupPostTool(_ context.Context, input AdvancedChatToolCallInput) (string, error) {
	content := truncateSessionTaskText(stringFromMap(input.Arguments, "content"), 20000)
	if content == "" {
		return "", errors.New("group message content is required")
	}
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("session_id = ? AND user_id = ?", input.SessionID, input.UserID).First(&member).Error; err != nil {
		return "", errors.New("this session is not attached to a chat group")
	}
	var existing int64
	if err := model.DB.Model(&AdvancedChatChatGroupMessage{}).Where("source_run_id = ? AND user_id = ?", input.RunID, input.UserID).Count(&existing).Error; err != nil {
		return "", err
	}
	if existing > 0 {
		return "", errors.New("this work run has already posted its group message")
	}
	message := AdvancedChatChatGroupMessage{
		ID:               newAdvancedChatID("acgmmsg"),
		GroupID:          member.GroupID,
		UserID:           input.UserID,
		SenderType:       chatGroupSenderAgent,
		SenderID:         member.ID,
		SenderName:       member.AgentName,
		Content:          content,
		MentionMemberIDs: "[]",
		Depth:            member.WorkDepth + 1,
		SourceRunID:      input.RunID,
	}
	if err := model.DB.Create(&message).Error; err != nil {
		return "", err
	}
	_ = model.DB.Model(&AdvancedChatChatGroup{}).Where("id = ? AND user_id = ?", member.GroupID, input.UserID).Update("updated_at", time.Now()).Error
	go dispatchChatGroupMessage(input.UserID, member.GroupID, message)
	encoded, _ := json.Marshal(gin.H{"posted": true, "message_id": message.ID})
	return string(encoded), nil
}

func (api *advancedChatAPI) listChatGroups(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var groups []AdvancedChatChatGroup
	if err := model.DB.Preload("Members", func(db *gorm.DB) *gorm.DB { return db.Order("created_at ASC") }).Where("user_id = ?", user.ID).Order("updated_at DESC").Find(&groups).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list chat groups"})
		return
	}
	c.JSON(http.StatusOK, groups)
}

func (api *advancedChatAPI) createChatGroup(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input chatGroupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group, members, err := buildChatGroup(user.ID, "", input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&group).Error; err != nil {
			return err
		}
		return tx.Create(&members).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chat group"})
		return
	}
	group.Members = members
	c.JSON(http.StatusCreated, group)
}

func (api *advancedChatAPI) updateChatGroup(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var existing AdvancedChatChatGroup
	if err := model.DB.Where("id = ? AND user_id = ?", c.Param("id"), user.ID).First(&existing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat group not found"})
		return
	}
	var working int64
	_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("group_id = ? AND user_id = ? AND status = ?", existing.ID, user.ID, chatGroupMemberWorking).Count(&working).Error
	if working > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Wait for all assistants to become idle before changing members"})
		return
	}
	var input chatGroupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group, members, err := buildChatGroup(user.ID, existing.ID, input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&existing).Updates(map[string]interface{}{"name": group.Name, "description": group.Description}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ? AND user_id = ?", existing.ID, user.ID).Delete(&AdvancedChatChatGroupMember{}).Error; err != nil {
			return err
		}
		return tx.Create(&members).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update chat group"})
		return
	}
	group.Members = members
	c.JSON(http.StatusOK, group)
}

func buildChatGroup(userID uint, groupID string, input chatGroupInput) (AdvancedChatChatGroup, []AdvancedChatChatGroupMember, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 120 {
		return AdvancedChatChatGroup{}, nil, errors.New("group name must be between 1 and 120 characters")
	}
	agentIDs := uniqueStringsLocal(input.AgentIDs)
	if len(agentIDs) == 0 || len(agentIDs) > 20 {
		return AdvancedChatChatGroup{}, nil, errors.New("select between 1 and 20 assistants")
	}
	if groupID == "" {
		groupID = newAdvancedChatID("acg")
	}
	members := make([]AdvancedChatChatGroupMember, 0, len(agentIDs))
	for _, agentID := range agentIDs {
		agent, err := loadAdvancedChatAgent(userID, agentID)
		if err != nil || agent == nil {
			return AdvancedChatChatGroup{}, nil, fmt.Errorf("assistant %s was not found", agentID)
		}
		members = append(members, AdvancedChatChatGroupMember{ID: newAdvancedChatID("acgm"), GroupID: groupID, UserID: userID, AgentID: agentID, AgentName: agent.Name, Status: chatGroupMemberIdle})
	}
	return AdvancedChatChatGroup{ID: groupID, UserID: userID, Name: name, Description: truncateSessionTaskText(input.Description, 2000)}, members, nil
}

func (api *advancedChatAPI) getChatGroup(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	group, messages, err := loadChatGroup(user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat group not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"group": group, "messages": messages})
}

func loadChatGroup(userID uint, groupID string) (AdvancedChatChatGroup, []AdvancedChatChatGroupMessage, error) {
	var group AdvancedChatChatGroup
	if err := model.DB.Preload("Members", func(db *gorm.DB) *gorm.DB { return db.Order("created_at ASC") }).Where("id = ? AND user_id = ?", strings.TrimSpace(groupID), userID).First(&group).Error; err != nil {
		return group, nil, err
	}
	var messages []AdvancedChatChatGroupMessage
	if err := model.DB.Where("group_id = ? AND user_id = ?", group.ID, userID).Order("created_at ASC").Limit(500).Find(&messages).Error; err != nil {
		return group, nil, err
	}
	for index := range messages {
		messages[index].Mentions = decodeStringList(messages[index].MentionMemberIDs)
	}
	return group, messages, nil
}

func (api *advancedChatAPI) deleteChatGroup(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	group, _, err := loadChatGroup(user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat group not found"})
		return
	}
	for _, member := range group.Members {
		if member.RunID != "" {
			_, _, _, _ = stopAdvancedChatRun(member.RunID, user.ID)
		}
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("group_id = ? AND user_id = ?", group.ID, user.ID).Delete(&AdvancedChatChatGroupMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ? AND user_id = ?", group.ID, user.ID).Delete(&AdvancedChatChatGroupMember{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND user_id = ?", group.ID, user.ID).Delete(&AdvancedChatChatGroup{}).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete chat group"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (api *advancedChatAPI) createChatGroupMessage(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	group, _, err := loadChatGroup(user.ID, c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat group not found"})
		return
	}
	var input chatGroupMessageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	content := truncateSessionTaskText(input.Content, 20000)
	if content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}
	mentions := validChatGroupMentions(group.Members, input.MentionMemberIDs)
	encoded, _ := json.Marshal(mentions)
	message := AdvancedChatChatGroupMessage{ID: newAdvancedChatID("acgmmsg"), GroupID: group.ID, UserID: user.ID, SenderType: chatGroupSenderUser, SenderName: firstNonEmpty(user.Username, "User"), Content: content, MentionMemberIDs: string(encoded), Mentions: mentions}
	if err := model.DB.Create(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}
	_ = model.DB.Model(&AdvancedChatChatGroup{}).Where("id = ?", group.ID).Update("updated_at", time.Now()).Error
	go dispatchChatGroupMessage(user.ID, group.ID, message)
	c.JSON(http.StatusAccepted, message)
}

func validChatGroupMentions(members []AdvancedChatChatGroupMember, values []string) []string {
	allowed := map[string]bool{}
	for _, member := range members {
		allowed[member.ID] = true
	}
	result := []string{}
	for _, value := range uniqueStringsLocal(values) {
		if allowed[value] {
			result = append(result, value)
		}
	}
	return result
}

func dispatchChatGroupMessage(userID uint, groupID string, message AdvancedChatChatGroupMessage) {
	if message.Depth >= chatGroupMaxMessageDepth {
		return
	}
	var members []AdvancedChatChatGroupMember
	if model.DB.Where("group_id = ? AND user_id = ?", groupID, userID).Find(&members).Error != nil {
		return
	}
	mentioned := map[string]bool{}
	for _, id := range decodeStringList(message.MentionMemberIDs) {
		mentioned[id] = true
	}
	for _, member := range members {
		if message.SenderType == chatGroupSenderAgent && member.ID == message.SenderID {
			continue
		}
		isMentioned := mentioned[member.ID]
		if member.Status == chatGroupMemberWorking {
			if !isMentioned {
				continue
			}
			if member.RunID != "" {
				_, _, _, _ = stopAdvancedChatRun(member.RunID, userID)
			}
			_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", member.ID, userID).Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""}).Error
		}
		claim := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ? AND status = ?", member.ID, userID, chatGroupMemberIdle).Updates(map[string]interface{}{"status": chatGroupMemberWorking, "work_depth": message.Depth})
		if claim.Error == nil && claim.RowsAffected == 1 {
			go runChatGroupMember(userID, groupID, member.ID, message)
		}
	}
}

func runChatGroupMember(userID uint, groupID string, memberID string, trigger AdvancedChatChatGroupMessage) {
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", memberID, groupID, userID).First(&member).Error; err != nil {
		return
	}
	defer func() {
		_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", memberID, userID).Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""}).Error
	}()
	var group AdvancedChatChatGroup
	if model.DB.Where("id = ? AND user_id = ?", groupID, userID).First(&group).Error != nil {
		return
	}
	var history []AdvancedChatChatGroupMessage
	_ = model.DB.Where("group_id = ? AND user_id = ?", groupID, userID).Order("created_at DESC").Limit(40).Find(&history).Error
	lines := make([]string, 0, len(history)+1)
	for index := len(history) - 1; index >= 0; index-- {
		lines = append(lines, fmt.Sprintf("%s: %s", history[index].SenderName, history[index].Content))
	}
	instruction := fmt.Sprintf("You are %s in the persistent chat group %q. Here is the recent group transcript:\n\n%s\n\nA new message was just sent by %s. Decide whether it concerns you. If it does, handle it using your tools when useful. Your normal response is private execution output. Only call send_group_message if you have one useful, concise result worth posting to the group. If it is irrelevant, finish without calling that tool. You have one work thread; finish this work before accepting normal new messages.", member.AgentName, group.Name, strings.Join(lines, "\n"), trigger.SenderName)
	sessionID := member.SessionID
	if sessionID == "" {
		sessionID = newAdvancedChatID("acg")
	}
	_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", member.ID, userID).Updates(map[string]interface{}{"session_id": sessionID, "work_depth": trigger.Depth}).Error
	messages := []advancedChatCompletionMessage{{ID: newAdvancedChatID("acm"), Role: "user", Content: instruction, Parts: normalizeAdvancedChatContentParts(nil, instruction)}}
	agent, err := loadAdvancedChatAgent(userID, member.AgentID)
	if err != nil || agent == nil {
		return
	}
	input := advancedChatCompletionInput{SessionID: sessionID, Title: group.Name + " / " + member.AgentName, Mode: advancedChatModeAssistant, AgentID: member.AgentID, ModelName: agent.DefaultModel, UserChannelID: agent.UserChannelID, Messages: messages, AutoCompressContext: true}
	prepared, _, _, err := prepareAdvancedChatAssistantRun(context.Background(), userID, input, messages, agent.DefaultModel)
	if err != nil {
		return
	}
	_, run, _, _, err := createAdvancedChatAssistantRun(userID, prepared)
	if err != nil {
		return
	}
	_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", member.ID, userID).Updates(map[string]interface{}{"session_id": sessionID, "run_id": run.ID, "status": chatGroupMemberWorking}).Error
	runAdvancedChatAssistantCompletion(run.ID, userID, prepared)
}

func (api *advancedChatAPI) getChatGroupMemberActivity(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", c.Param("member_id"), c.Param("id"), user.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group member not found"})
		return
	}
	var run AdvancedChatRun
	var events []AdvancedChatRunEvent
	var message AdvancedChatMessage
	if member.RunID != "" {
		_ = model.DB.Where("id = ? AND user_id = ?", member.RunID, user.ID).First(&run).Error
		_ = model.DB.Where("run_id = ? AND user_id = ?", member.RunID, user.ID).Order("seq ASC").Find(&events).Error
		if run.AssistantMessageID != "" {
			_ = model.DB.Where("id = ? AND user_id = ?", run.AssistantMessageID, user.ID).First(&message).Error
		}
	}
	eventResponses := make([]advancedChatRunEventResponse, 0, len(events))
	for _, event := range events {
		eventResponses = append(eventResponses, advancedChatRunEventResponseFromModel(event))
	}
	c.JSON(http.StatusOK, gin.H{"member": member, "run": func() interface{} {
		if run.ID == "" {
			return nil
		}
		return advancedChatRunResponseFromModel(run)
	}(), "events": eventResponses, "output": message.Content})
}
