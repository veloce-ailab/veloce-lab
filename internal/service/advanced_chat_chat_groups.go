package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

const (
	chatGroupMemberIdle        = "idle"
	chatGroupMemberWorking     = "working"
	chatGroupSenderUser        = "user"
	chatGroupSenderAgent       = "agent"
	chatGroupMaxMessageDepth   = 8
	chatGroupPostToolName      = "send_group_message"
	chatPrivatePostToolName    = "send_private_message"
	chatGroupHistoryToolName   = "read_group_history"
	chatPrivateHistoryToolName = "read_private_history"
	chatHistorySearchToolName  = "search_group_history"
	chatGroupStopToolName      = "stop_processing"
	chatMessageMaxWait         = 300
	chatHistoryDefaultLimit    = 20
	chatHistoryMaxLimit        = 50
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
	ID                string    `gorm:"primaryKey;size:80" json:"id"`
	GroupID           string    `gorm:"uniqueIndex:idx_chat_group_agent;size:80;not null" json:"group_id"`
	UserID            uint      `gorm:"index;not null" json:"-"`
	AgentID           string    `gorm:"uniqueIndex:idx_chat_group_agent;size:80;not null" json:"agent_id"`
	AgentName         string    `gorm:"size:100;not null" json:"agent_name"`
	ModelName         string    `gorm:"size:100;not null;default:''" json:"model_name"`
	UserChannelID     uint      `gorm:"index" json:"user_channel_id,omitempty"`
	ConnectorDeviceID string    `gorm:"size:80;index;not null;default:''" json:"connector_device_id,omitempty"`
	SessionID         string    `gorm:"size:80;index" json:"session_id,omitempty"`
	RunID             string    `gorm:"size:80;index" json:"run_id,omitempty"`
	Status            string    `gorm:"size:20;index;not null;default:'idle'" json:"status"`
	WorkDepth         int       `gorm:"not null;default:0" json:"-"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
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

type AdvancedChatPrivateConversation struct {
	ID            string    `gorm:"primaryKey;size:80" json:"id"`
	GroupID       string    `gorm:"uniqueIndex:idx_chat_private_pair;size:80;not null" json:"group_id"`
	UserID        uint      `gorm:"index;not null" json:"-"`
	MemberAID     string    `gorm:"uniqueIndex:idx_chat_private_pair;size:80;not null" json:"member_a_id"`
	MemberBID     string    `gorm:"uniqueIndex:idx_chat_private_pair;size:80;not null" json:"member_b_id"`
	MemberAName   string    `gorm:"size:100;not null" json:"member_a_name"`
	MemberBName   string    `gorm:"size:100;not null" json:"member_b_name"`
	LastMessageAt time.Time `gorm:"index" json:"last_message_at"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	LastMessage   string    `gorm:"-" json:"last_message,omitempty"`
}

type AdvancedChatPrivateMessage struct {
	ID                string     `gorm:"primaryKey;size:80" json:"id"`
	ConversationID    string     `gorm:"index;size:80;not null" json:"conversation_id"`
	GroupID           string     `gorm:"index;size:80;not null" json:"group_id"`
	UserID            uint       `gorm:"index;not null" json:"-"`
	SenderMemberID    string     `gorm:"index;size:80;not null" json:"sender_member_id"`
	SenderName        string     `gorm:"size:100;not null" json:"sender_name"`
	RecipientMemberID string     `gorm:"index;size:80;not null" json:"recipient_member_id"`
	Content           string     `gorm:"type:text;not null" json:"content"`
	SourceRunID       string     `gorm:"size:80;index" json:"-"`
	DeliveredAt       *time.Time `gorm:"index" json:"-"`
	CreatedAt         time.Time  `json:"created_at"`
}

type chatGroupInput struct {
	Name          string                       `json:"name"`
	Description   string                       `json:"description"`
	AgentIDs      []string                     `json:"agent_ids"`
	MemberConfigs []chatGroupMemberConfigInput `json:"member_configs"`
}

type chatGroupMemberConfigInput struct {
	AgentID           string `json:"agent_id"`
	ModelName         string `json:"model_name"`
	UserChannelID     uint   `json:"user_channel_id"`
	ConnectorDeviceID string `json:"connector_device_id"`
}

type chatGroupMessageInput struct {
	Content          string   `json:"content"`
	MentionMemberIDs []string `json:"mention_member_ids"`
}

func init() {
	RegisterAdvancedChatRuntimeExtensionHook(chatGroupRuntimeExtension)
	RegisterAdvancedChatToolHandler(chatGroupPostToolName, handleChatGroupPostTool)
	RegisterAdvancedChatToolHandler(chatPrivatePostToolName, handleChatPrivatePostTool)
	RegisterAdvancedChatToolHandler(chatGroupHistoryToolName, handleChatGroupHistoryTool)
	RegisterAdvancedChatToolHandler(chatPrivateHistoryToolName, handleChatPrivateHistoryTool)
	RegisterAdvancedChatToolHandler(chatHistorySearchToolName, handleChatHistorySearchTool)
	RegisterAdvancedChatToolHandler(chatGroupStopToolName, handleChatGroupStopTool)
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
	var members []AdvancedChatChatGroupMember
	if err := model.DB.Where("group_id = ? AND user_id = ?", member.GroupID, input.UserID).Order("created_at ASC").Find(&members).Error; err != nil {
		return AdvancedChatRuntimeExtension{}, err
	}
	directory := make([]string, 0, len(members))
	for _, item := range members {
		if item.ID != member.ID {
			directory = append(directory, fmt.Sprintf("- %s: %s", item.AgentName, item.ID))
		}
	}
	return AdvancedChatRuntimeExtension{
		SystemPrompt: "Messaging rule: normal assistant text is private work output. Use send_group_message only for one useful public group message. Use send_private_message for a message visible only to one other assistant in this group. Use read_group_history to inspect recent public messages, read_private_history to inspect your private conversation with one other assistant, and search_group_history to find relevant public or private messages. History results are newest first. Both message tools can wait for replies; wait_forever ends this run until a later message wakes you. If the incoming message does not require any action or response, call stop_processing immediately to end this run and avoid a private-message loop. Do not publish internal reasoning, progress narration, acknowledgements, or irrelevant work.\n\nPrivate-message targets in this isolated group:\n" + strings.Join(directory, "\n"),
		Tools: []ChatExecutorTool{{
			Name:        chatGroupPostToolName,
			Description: "Post one deliberate message to the current chat group. This is the only way your output becomes visible in the group and notifies other assistants.",
			Schema: map[string]interface{}{
				"type":     "object",
				"required": []string{"content"},
				"properties": map[string]interface{}{
					"content":      map[string]interface{}{"type": "string", "description": "Concise, complete group message worth notifying other assistants about."},
					"wait_seconds": map[string]interface{}{"type": "integer", "minimum": 0, "maximum": chatMessageMaxWait, "description": "Wait this many seconds for a reply before continuing. Zero continues immediately."},
					"wait_forever": map[string]interface{}{"type": "boolean", "description": "End this run after sending and wait until a later event wakes you."},
				},
			},
		}, {
			Name:        chatPrivatePostToolName,
			Description: "Send a private message to one assistant in the current group. Only the two assistants and the user can see this group-scoped conversation.",
			Schema: map[string]interface{}{
				"type": "object", "required": []string{"target_member_id", "content"},
				"properties": map[string]interface{}{
					"target_member_id": map[string]interface{}{"type": "string", "description": "Target group member ID."},
					"content":          map[string]interface{}{"type": "string", "description": "Private message content."},
					"wait_seconds":     map[string]interface{}{"type": "integer", "minimum": 0, "maximum": chatMessageMaxWait, "description": "Wait this many seconds for a private reply before continuing. Zero continues immediately."},
					"wait_forever":     map[string]interface{}{"type": "boolean", "description": "End this run after sending and wait until a later event wakes you."},
				},
			},
		}, {
			Name:        chatGroupHistoryToolName,
			Description: "Read recent public messages in the current group, newest first.",
			Schema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{"type": "integer", "minimum": 1, "maximum": chatHistoryMaxLimit, "description": "Number of messages to return; defaults to 20."},
				},
			},
		}, {
			Name:        chatPrivateHistoryToolName,
			Description: "Read the private conversation between you and one other assistant in this group, newest first.",
			Schema: map[string]interface{}{
				"type":     "object",
				"required": []string{"target_member_id"},
				"properties": map[string]interface{}{
					"target_member_id": map[string]interface{}{"type": "string", "description": "The other assistant's group member ID."},
					"limit":            map[string]interface{}{"type": "integer", "minimum": 1, "maximum": chatHistoryMaxLimit, "description": "Number of messages to return; defaults to 20."},
				},
			},
		}, {
			Name:        chatHistorySearchToolName,
			Description: "Search public group messages and your own private conversations in this group. Results are newest first.",
			Schema: map[string]interface{}{
				"type":     "object",
				"required": []string{"query"},
				"properties": map[string]interface{}{
					"query":            map[string]interface{}{"type": "string", "description": "Text to find in message content."},
					"scope":            map[string]interface{}{"type": "string", "enum": []string{"all", "group", "private"}, "description": "Defaults to all."},
					"target_member_id": map[string]interface{}{"type": "string", "description": "Optionally limit private results to one other assistant."},
					"limit":            map[string]interface{}{"type": "integer", "minimum": 1, "maximum": chatHistoryMaxLimit, "description": "Number of messages to return; defaults to 20."},
				},
			},
		}, {
			Name:        chatGroupStopToolName,
			Description: "Stop this assistant run when the incoming group or private message does not require any action or response. Use this instead of sending an acknowledgement; it prevents assistants from repeatedly waking each other.",
			Schema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"reason": map[string]interface{}{"type": "string", "description": "Optional short internal reason for stopping; it is not sent to the group."},
				},
			},
		}},
	}, nil
}

func loadChatGroupMemberForTool(input AdvancedChatToolCallInput) (AdvancedChatChatGroupMember, error) {
	if strings.TrimSpace(input.SessionID) == "" {
		return AdvancedChatChatGroupMember{}, errors.New("chat history is only available from a group assistant session")
	}
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("session_id = ? AND user_id = ?", input.SessionID, input.UserID).First(&member).Error; err != nil {
		return AdvancedChatChatGroupMember{}, errors.New("this session is not attached to a chat group")
	}
	return member, nil
}

func chatHistoryLimit(arguments map[string]interface{}) (int, error) {
	limit := chatHistoryDefaultLimit
	if raw, ok := arguments["limit"]; ok {
		switch value := raw.(type) {
		case float64:
			if value != float64(int(value)) {
				return 0, errors.New("limit must be an integer")
			}
			limit = int(value)
		case int:
			limit = value
		case json.Number:
			parsed, err := value.Int64()
			if err != nil {
				return 0, errors.New("limit must be an integer")
			}
			limit = int(parsed)
		default:
			return 0, errors.New("limit must be an integer")
		}
	}
	if limit < 1 || limit > chatHistoryMaxLimit {
		return 0, fmt.Errorf("limit must be between 1 and %d", chatHistoryMaxLimit)
	}
	return limit, nil
}

func handleChatGroupHistoryTool(_ context.Context, input AdvancedChatToolCallInput) (string, error) {
	member, err := loadChatGroupMemberForTool(input)
	if err != nil {
		return "", err
	}
	limit, err := chatHistoryLimit(input.Arguments)
	if err != nil {
		return "", err
	}
	var messages []AdvancedChatChatGroupMessage
	if err := model.DB.Where("group_id = ? AND user_id = ?", member.GroupID, input.UserID).Order("created_at DESC").Limit(limit).Find(&messages).Error; err != nil {
		return "", err
	}
	encoded, err := json.Marshal(gin.H{"scope": "group", "group_id": member.GroupID, "order": "newest_first", "messages": messages})
	return string(encoded), err
}

func handleChatPrivateHistoryTool(_ context.Context, input AdvancedChatToolCallInput) (string, error) {
	member, err := loadChatGroupMemberForTool(input)
	if err != nil {
		return "", err
	}
	limit, err := chatHistoryLimit(input.Arguments)
	if err != nil {
		return "", err
	}
	targetID := strings.TrimSpace(stringFromMap(input.Arguments, "target_member_id"))
	if targetID == "" || targetID == member.ID {
		return "", errors.New("select another assistant in this group")
	}
	var target AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", targetID, member.GroupID, input.UserID).First(&target).Error; err != nil {
		return "", errors.New("target assistant was not found in this group")
	}
	a, b := member.ID, target.ID
	if a > b {
		a, b = b, a
	}
	var conversation AdvancedChatPrivateConversation
	if err := model.DB.Where("group_id = ? AND user_id = ? AND member_a_id = ? AND member_b_id = ?", member.GroupID, input.UserID, a, b).First(&conversation).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}
	messages := []AdvancedChatPrivateMessage{}
	if conversation.ID != "" {
		if err := model.DB.Where("conversation_id = ? AND user_id = ?", conversation.ID, input.UserID).Order("created_at DESC").Limit(limit).Find(&messages).Error; err != nil {
			return "", err
		}
	}
	encoded, err := json.Marshal(gin.H{"scope": "private", "group_id": member.GroupID, "target_member_id": target.ID, "conversation_id": conversation.ID, "order": "newest_first", "messages": messages})
	return string(encoded), err
}

type chatHistorySearchResult struct {
	Scope             string    `json:"scope"`
	ConversationID    string    `json:"conversation_id,omitempty"`
	SenderType        string    `json:"sender_type,omitempty"`
	SenderID          string    `json:"sender_id,omitempty"`
	SenderName        string    `json:"sender_name"`
	RecipientMemberID string    `json:"recipient_member_id,omitempty"`
	Content           string    `json:"content"`
	CreatedAt         time.Time `json:"created_at"`
}

func handleChatHistorySearchTool(_ context.Context, input AdvancedChatToolCallInput) (string, error) {
	member, err := loadChatGroupMemberForTool(input)
	if err != nil {
		return "", err
	}
	query := truncateSessionTaskText(stringFromMap(input.Arguments, "query"), 200)
	if query == "" {
		return "", errors.New("search query is required")
	}
	limit, err := chatHistoryLimit(input.Arguments)
	if err != nil {
		return "", err
	}
	scope := strings.ToLower(strings.TrimSpace(stringFromMap(input.Arguments, "scope")))
	if scope == "" {
		scope = "all"
	}
	if scope != "all" && scope != "group" && scope != "private" {
		return "", errors.New("scope must be all, group, or private")
	}
	targetID := strings.TrimSpace(stringFromMap(input.Arguments, "target_member_id"))
	if targetID == member.ID {
		return "", errors.New("select another assistant in this group")
	}
	if targetID != "" {
		var count int64
		if err := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND group_id = ? AND user_id = ?", targetID, member.GroupID, input.UserID).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return "", errors.New("target assistant was not found in this group")
		}
	}

	pattern := "%" + strings.ToLower(query) + "%"
	results := make([]chatHistorySearchResult, 0, limit*2)
	if scope == "all" || scope == "group" {
		var messages []AdvancedChatChatGroupMessage
		if err := model.DB.Where("group_id = ? AND user_id = ? AND LOWER(content) LIKE ?", member.GroupID, input.UserID, pattern).Order("created_at DESC").Limit(limit).Find(&messages).Error; err != nil {
			return "", err
		}
		for _, message := range messages {
			results = append(results, chatHistorySearchResult{Scope: "group", SenderType: message.SenderType, SenderID: message.SenderID, SenderName: message.SenderName, Content: message.Content, CreatedAt: message.CreatedAt})
		}
	}
	if scope == "all" || scope == "private" {
		privateQuery := model.DB.Where("group_id = ? AND user_id = ? AND (sender_member_id = ? OR recipient_member_id = ?) AND LOWER(content) LIKE ?", member.GroupID, input.UserID, member.ID, member.ID, pattern)
		if targetID != "" {
			privateQuery = privateQuery.Where("(sender_member_id = ? OR recipient_member_id = ?)", targetID, targetID)
		}
		var messages []AdvancedChatPrivateMessage
		if err := privateQuery.Order("created_at DESC").Limit(limit).Find(&messages).Error; err != nil {
			return "", err
		}
		for _, message := range messages {
			results = append(results, chatHistorySearchResult{Scope: "private", ConversationID: message.ConversationID, SenderID: message.SenderMemberID, SenderName: message.SenderName, RecipientMemberID: message.RecipientMemberID, Content: message.Content, CreatedAt: message.CreatedAt})
		}
	}
	sort.Slice(results, func(i, j int) bool { return results[i].CreatedAt.After(results[j].CreatedAt) })
	if len(results) > limit {
		results = results[:limit]
	}
	encoded, err := json.Marshal(gin.H{"scope": scope, "group_id": member.GroupID, "order": "newest_first", "results": results})
	return string(encoded), err
}

func handleChatGroupStopTool(_ context.Context, input AdvancedChatToolCallInput) (string, error) {
	if _, err := loadChatGroupMemberForTool(input); err != nil {
		return "", err
	}
	if strings.TrimSpace(input.RunID) == "" {
		return "", errors.New("current run is required")
	}
	run, _, message, err := stopAdvancedChatRun(input.RunID, input.UserID)
	if err != nil {
		if strings.TrimSpace(message) != "" {
			return "", errors.New(message)
		}
		return "", err
	}
	encoded, err := json.Marshal(gin.H{"stopped": run.Status == advancedChatRunStatusCancelled, "run_id": run.ID})
	return string(encoded), err
}

func handleChatGroupPostTool(ctx context.Context, input AdvancedChatToolCallInput) (string, error) {
	if _, _, err := messageWaitOptions(input.Arguments); err != nil {
		return "", err
	}
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
	replies, err := waitForGroupReplies(ctx, input.UserID, member, message.CreatedAt, input.Arguments)
	if err != nil {
		return "", err
	}
	stopRunAfterMessageWait(input)
	encoded, _ := json.Marshal(gin.H{"posted": true, "message_id": message.ID, "replies": replies})
	return string(encoded), nil
}

func handleChatPrivatePostTool(ctx context.Context, input AdvancedChatToolCallInput) (string, error) {
	if _, _, err := messageWaitOptions(input.Arguments); err != nil {
		return "", err
	}
	content := truncateSessionTaskText(stringFromMap(input.Arguments, "content"), 20000)
	if content == "" {
		return "", errors.New("private message content is required")
	}
	var sender, recipient AdvancedChatChatGroupMember
	if err := model.DB.Where("session_id = ? AND user_id = ?", input.SessionID, input.UserID).First(&sender).Error; err != nil {
		return "", errors.New("this session is not attached to a chat group")
	}
	targetID := strings.TrimSpace(stringFromMap(input.Arguments, "target_member_id"))
	if targetID == "" || targetID == sender.ID {
		return "", errors.New("select another assistant in this group")
	}
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", targetID, sender.GroupID, input.UserID).First(&recipient).Error; err != nil {
		return "", errors.New("target assistant was not found in this group")
	}
	conversation, err := findOrCreatePrivateConversation(input.UserID, sender, recipient)
	if err != nil {
		return "", err
	}
	message := AdvancedChatPrivateMessage{ID: newAdvancedChatID("acpm"), ConversationID: conversation.ID, GroupID: sender.GroupID, UserID: input.UserID, SenderMemberID: sender.ID, SenderName: sender.AgentName, RecipientMemberID: recipient.ID, Content: content, SourceRunID: input.RunID}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&message).Error; err != nil {
			return err
		}
		return tx.Model(&AdvancedChatPrivateConversation{}).Where("id = ? AND user_id = ?", conversation.ID, input.UserID).Updates(map[string]interface{}{"last_message_at": message.CreatedAt, "updated_at": message.CreatedAt}).Error
	}); err != nil {
		return "", err
	}
	go dispatchPrivateMessage(input.UserID, message)
	replies, err := waitForPrivateReplies(ctx, input.UserID, conversation.ID, recipient.ID, sender.ID, message.CreatedAt, input.Arguments)
	if err != nil {
		return "", err
	}
	stopRunAfterMessageWait(input)
	encoded, _ := json.Marshal(gin.H{"sent": true, "conversation_id": conversation.ID, "message_id": message.ID, "replies": replies})
	return string(encoded), nil
}

func messageWaitOptions(arguments map[string]interface{}) (int, bool, error) {
	wait := 0
	switch value := arguments["wait_seconds"].(type) {
	case float64:
		wait = int(value)
	case int:
		wait = value
	case json.Number:
		parsed, _ := value.Int64()
		wait = int(parsed)
	}
	forever, _ := arguments["wait_forever"].(bool)
	if wait < 0 || wait > chatMessageMaxWait {
		return 0, false, fmt.Errorf("wait_seconds must be between 0 and %d", chatMessageMaxWait)
	}
	if forever && wait > 0 {
		return 0, false, errors.New("wait_forever cannot be combined with wait_seconds")
	}
	return wait, forever, nil
}

func stopRunAfterMessageWait(input AdvancedChatToolCallInput) {
	_, forever, err := messageWaitOptions(input.Arguments)
	if err == nil && forever {
		_, _, _, _ = stopAdvancedChatRun(input.RunID, input.UserID)
	}
}

func waitForGroupReplies(ctx context.Context, userID uint, member AdvancedChatChatGroupMember, after time.Time, arguments map[string]interface{}) ([]AdvancedChatChatGroupMessage, error) {
	wait, _, err := messageWaitOptions(arguments)
	if err != nil || wait == 0 {
		return nil, err
	}
	deadline := time.NewTimer(time.Duration(wait) * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-deadline.C:
			return []AdvancedChatChatGroupMessage{}, nil
		case <-ticker.C:
			var replies []AdvancedChatChatGroupMessage
			err := model.DB.Where("group_id = ? AND user_id = ? AND sender_type = ? AND sender_id <> ? AND created_at > ?", member.GroupID, userID, chatGroupSenderAgent, member.ID, after).Order("created_at ASC").Find(&replies).Error
			if err != nil {
				return nil, err
			}
			if len(replies) > 0 {
				return replies, nil
			}
		}
	}
}

func waitForPrivateReplies(ctx context.Context, userID uint, conversationID, senderID, recipientID string, after time.Time, arguments map[string]interface{}) ([]AdvancedChatPrivateMessage, error) {
	wait, _, err := messageWaitOptions(arguments)
	if err != nil || wait == 0 {
		return nil, err
	}
	deadline := time.NewTimer(time.Duration(wait) * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-deadline.C:
			return []AdvancedChatPrivateMessage{}, nil
		case <-ticker.C:
			var replies []AdvancedChatPrivateMessage
			err := model.DB.Where("conversation_id = ? AND user_id = ? AND sender_member_id = ? AND recipient_member_id = ? AND created_at > ?", conversationID, userID, senderID, recipientID, after).Order("created_at ASC").Find(&replies).Error
			if err != nil {
				return nil, err
			}
			if len(replies) > 0 {
				ids := make([]string, 0, len(replies))
				for _, reply := range replies {
					ids = append(ids, reply.ID)
				}
				now := time.Now()
				if err := model.DB.Model(&AdvancedChatPrivateMessage{}).Where("id IN ? AND user_id = ? AND delivered_at IS NULL", ids, userID).Update("delivered_at", &now).Error; err != nil {
					return nil, err
				}
				return replies, nil
			}
		}
	}
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
		if err := tx.Where("group_id = ? AND user_id = ?", existing.ID, user.ID).Delete(&AdvancedChatPrivateMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ? AND user_id = ?", existing.ID, user.ID).Delete(&AdvancedChatPrivateConversation{}).Error; err != nil {
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
	configs := map[string]chatGroupMemberConfigInput{}
	for _, config := range input.MemberConfigs {
		configs[strings.TrimSpace(config.AgentID)] = config
	}
	for _, agentID := range agentIDs {
		agent, err := loadAdvancedChatAgent(userID, agentID)
		if err != nil || agent == nil {
			return AdvancedChatChatGroup{}, nil, fmt.Errorf("assistant %s was not found", agentID)
		}
		config := configs[agentID]
		modelName := strings.TrimSpace(config.ModelName)
		if modelName == "" {
			modelName = strings.TrimSpace(agent.DefaultModel)
		}
		if len([]rune(modelName)) > 100 {
			return AdvancedChatChatGroup{}, nil, fmt.Errorf("model for assistant %s is too long", agentID)
		}
		userChannelID := config.UserChannelID
		if userChannelID == 0 {
			userChannelID = agent.UserChannelID
		}
		deviceID := strings.TrimSpace(config.ConnectorDeviceID)
		if deviceID != "" {
			var count int64
			if err := model.DB.Model(&AdvancedChatConnectorDevice{}).Where("id = ? AND user_id = ?", deviceID, userID).Count(&count).Error; err != nil || count == 0 {
				return AdvancedChatChatGroup{}, nil, fmt.Errorf("device for assistant %s was not found", agentID)
			}
		}
		members = append(members, AdvancedChatChatGroupMember{ID: newAdvancedChatID("acgm"), GroupID: groupID, UserID: userID, AgentID: agentID, AgentName: agent.Name, ModelName: modelName, UserChannelID: userChannelID, ConnectorDeviceID: deviceID, Status: chatGroupMemberIdle})
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

func findOrCreatePrivateConversation(userID uint, first, second AdvancedChatChatGroupMember) (AdvancedChatPrivateConversation, error) {
	if first.GroupID != second.GroupID {
		return AdvancedChatPrivateConversation{}, errors.New("private conversations cannot cross chat groups")
	}
	a, b := first, second
	if a.ID > b.ID {
		a, b = b, a
	}
	var conversation AdvancedChatPrivateConversation
	err := model.DB.Where("group_id = ? AND user_id = ? AND member_a_id = ? AND member_b_id = ?", a.GroupID, userID, a.ID, b.ID).First(&conversation).Error
	if err == nil {
		return conversation, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return conversation, err
	}
	conversation = AdvancedChatPrivateConversation{ID: newAdvancedChatID("acpc"), GroupID: a.GroupID, UserID: userID, MemberAID: a.ID, MemberBID: b.ID, MemberAName: a.AgentName, MemberBName: b.AgentName, LastMessageAt: time.Now()}
	if err := model.DB.Create(&conversation).Error; err != nil {
		if lookup := model.DB.Where("group_id = ? AND user_id = ? AND member_a_id = ? AND member_b_id = ?", a.GroupID, userID, a.ID, b.ID).First(&conversation).Error; lookup == nil {
			return conversation, nil
		}
		return conversation, err
	}
	return conversation, nil
}

func (api *advancedChatAPI) listPrivateConversations(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	if _, _, err := loadChatGroup(user.ID, c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chat group not found"})
		return
	}
	var conversations []AdvancedChatPrivateConversation
	if err := model.DB.Where("group_id = ? AND user_id = ?", c.Param("id"), user.ID).Order("last_message_at DESC").Find(&conversations).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list private conversations"})
		return
	}
	for index := range conversations {
		var message AdvancedChatPrivateMessage
		if model.DB.Where("conversation_id = ? AND user_id = ?", conversations[index].ID, user.ID).Order("created_at DESC").First(&message).Error == nil {
			conversations[index].LastMessage = message.Content
		}
	}
	c.JSON(http.StatusOK, conversations)
}

func (api *advancedChatAPI) getPrivateConversation(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var conversation AdvancedChatPrivateConversation
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", c.Param("conversation_id"), c.Param("id"), user.ID).First(&conversation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Private conversation not found"})
		return
	}
	var messages []AdvancedChatPrivateMessage
	if err := model.DB.Where("conversation_id = ? AND group_id = ? AND user_id = ?", conversation.ID, conversation.GroupID, user.ID).Order("created_at ASC").Limit(500).Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load private conversation"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"conversation": conversation, "messages": messages})
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
		if err := tx.Where("group_id = ? AND user_id = ?", group.ID, user.ID).Delete(&AdvancedChatPrivateMessage{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_id = ? AND user_id = ?", group.ID, user.ID).Delete(&AdvancedChatPrivateConversation{}).Error; err != nil {
			return err
		}
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
			if !interruptChatGroupMember(userID, &member) {
				continue
			}
		}
		claim := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ? AND status = ?", member.ID, userID, chatGroupMemberIdle).Updates(map[string]interface{}{"status": chatGroupMemberWorking, "work_depth": message.Depth})
		if claim.Error == nil && claim.RowsAffected == 1 {
			go runChatGroupMember(userID, groupID, member.ID, message)
		}
	}
}

func dispatchPrivateMessage(userID uint, message AdvancedChatPrivateMessage) {
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", message.RecipientMemberID, message.GroupID, userID).First(&member).Error; err != nil {
		return
	}
	if member.Status == chatGroupMemberWorking {
		if !interruptChatGroupMember(userID, &member) {
			return
		}
	}
	claim := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND group_id = ? AND user_id = ? AND status = ?", message.RecipientMemberID, message.GroupID, userID, chatGroupMemberIdle).Updates(map[string]interface{}{"status": chatGroupMemberWorking, "work_depth": 0})
	if claim.Error != nil || claim.RowsAffected != 1 {
		return
	}
	now := time.Now()
	updated := model.DB.Model(&AdvancedChatPrivateMessage{}).Where("id = ? AND user_id = ? AND delivered_at IS NULL", message.ID, userID).Update("delivered_at", &now)
	if updated.Error != nil || updated.RowsAffected != 1 {
		_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", message.RecipientMemberID, userID).Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""}).Error
		return
	}
	go runPrivateChatMember(userID, message)
}

func interruptChatGroupMember(userID uint, member *AdvancedChatChatGroupMember) bool {
	for attempt := 0; member.Status == chatGroupMemberWorking && member.RunID == "" && attempt < 80; attempt++ {
		time.Sleep(25 * time.Millisecond)
		if model.DB.Where("id = ? AND group_id = ? AND user_id = ?", member.ID, member.GroupID, userID).First(member).Error != nil {
			return false
		}
	}
	if member.Status != chatGroupMemberWorking {
		return true
	}
	if member.RunID == "" {
		return false
	}
	_, _, _, _ = stopAdvancedChatRun(member.RunID, userID)
	released := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND group_id = ? AND user_id = ? AND status = ? AND run_id = ?", member.ID, member.GroupID, userID, chatGroupMemberWorking, member.RunID).Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""})
	return released.Error == nil && released.RowsAffected == 1
}

func dispatchNextPrivateMessage(userID uint, groupID, memberID string) {
	var message AdvancedChatPrivateMessage
	if model.DB.Where("group_id = ? AND user_id = ? AND recipient_member_id = ? AND delivered_at IS NULL", groupID, userID, memberID).Order("created_at ASC").First(&message).Error == nil {
		dispatchPrivateMessage(userID, message)
	}
}

func runChatGroupMember(userID uint, groupID string, memberID string, trigger AdvancedChatChatGroupMessage) {
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", memberID, groupID, userID).First(&member).Error; err != nil {
		return
	}
	ownedRunID := ""
	defer func() {
		query := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ? AND status = ?", memberID, userID, chatGroupMemberWorking)
		if ownedRunID == "" {
			query = query.Where("run_id = ?", "")
		} else {
			query = query.Where("run_id = ?", ownedRunID)
		}
		released := query.Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""})
		if released.Error == nil && released.RowsAffected == 1 {
			dispatchNextPrivateMessage(userID, groupID, memberID)
		}
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
	modelName := firstNonEmpty(member.ModelName, agent.DefaultModel)
	userChannelID := member.UserChannelID
	if userChannelID == 0 {
		userChannelID = agent.UserChannelID
	}
	input := advancedChatCompletionInput{SessionID: sessionID, Title: group.Name + " / " + member.AgentName, Mode: advancedChatModeAssistant, AgentID: member.AgentID, ModelName: modelName, UserChannelID: userChannelID, ConnectorDeviceID: member.ConnectorDeviceID, Messages: messages, AutoCompressContext: true}
	prepared, _, _, err := prepareAdvancedChatAssistantRun(context.Background(), userID, input, messages, modelName)
	if err != nil {
		return
	}
	_, run, _, _, err := createAdvancedChatAssistantRun(userID, prepared)
	if err != nil {
		return
	}
	ownedRunID = run.ID
	_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", member.ID, userID).Updates(map[string]interface{}{"session_id": sessionID, "run_id": run.ID, "status": chatGroupMemberWorking}).Error
	runAdvancedChatAssistantCompletion(run.ID, userID, prepared)
}

func runPrivateChatMember(userID uint, trigger AdvancedChatPrivateMessage) {
	var member AdvancedChatChatGroupMember
	if err := model.DB.Where("id = ? AND group_id = ? AND user_id = ?", trigger.RecipientMemberID, trigger.GroupID, userID).First(&member).Error; err != nil {
		return
	}
	ownedRunID := ""
	defer func() {
		query := model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ? AND status = ?", member.ID, userID, chatGroupMemberWorking)
		if ownedRunID == "" {
			query = query.Where("run_id = ?", "")
		} else {
			query = query.Where("run_id = ?", ownedRunID)
		}
		released := query.Updates(map[string]interface{}{"status": chatGroupMemberIdle, "run_id": ""})
		if released.Error == nil && released.RowsAffected == 1 {
			dispatchNextPrivateMessage(userID, trigger.GroupID, member.ID)
		}
	}()
	var group AdvancedChatChatGroup
	if model.DB.Where("id = ? AND user_id = ?", trigger.GroupID, userID).First(&group).Error != nil {
		return
	}
	var conversation AdvancedChatPrivateConversation
	if model.DB.Where("id = ? AND group_id = ? AND user_id = ?", trigger.ConversationID, trigger.GroupID, userID).First(&conversation).Error != nil {
		return
	}
	var history []AdvancedChatPrivateMessage
	_ = model.DB.Where("conversation_id = ? AND user_id = ?", conversation.ID, userID).Order("created_at DESC").Limit(40).Find(&history).Error
	lines := make([]string, 0, len(history))
	for index := len(history) - 1; index >= 0; index-- {
		lines = append(lines, fmt.Sprintf("%s: %s", history[index].SenderName, history[index].Content))
	}
	otherName := conversation.MemberAName
	if conversation.MemberAID == member.ID {
		otherName = conversation.MemberBName
	}
	instruction := fmt.Sprintf("You are %s in the isolated chat group %q. This is a private conversation with %s; no other assistant can see it. Recent private transcript:\n\n%s\n\n%s just sent you a private message. Handle it as needed. Your normal output remains private execution output. Reply only through send_private_message with target_member_id %q. Do not use send_group_message unless you separately intend to publish something to the whole group.", member.AgentName, group.Name, otherName, strings.Join(lines, "\n"), trigger.SenderName, trigger.SenderMemberID)
	sessionID := member.SessionID
	if sessionID == "" {
		sessionID = newAdvancedChatID("acg")
	}
	_ = model.DB.Model(&AdvancedChatChatGroupMember{}).Where("id = ? AND user_id = ?", member.ID, userID).Update("session_id", sessionID).Error
	messages := []advancedChatCompletionMessage{{ID: newAdvancedChatID("acm"), Role: "user", Content: instruction, Parts: normalizeAdvancedChatContentParts(nil, instruction)}}
	agent, err := loadAdvancedChatAgent(userID, member.AgentID)
	if err != nil || agent == nil {
		return
	}
	modelName := firstNonEmpty(member.ModelName, agent.DefaultModel)
	userChannelID := member.UserChannelID
	if userChannelID == 0 {
		userChannelID = agent.UserChannelID
	}
	input := advancedChatCompletionInput{SessionID: sessionID, Title: group.Name + " / " + member.AgentName, Mode: advancedChatModeAssistant, AgentID: member.AgentID, ModelName: modelName, UserChannelID: userChannelID, ConnectorDeviceID: member.ConnectorDeviceID, Messages: messages, AutoCompressContext: true}
	prepared, _, _, err := prepareAdvancedChatAssistantRun(context.Background(), userID, input, messages, modelName)
	if err != nil {
		return
	}
	_, run, _, _, err := createAdvancedChatAssistantRun(userID, prepared)
	if err != nil {
		return
	}
	ownedRunID = run.ID
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
