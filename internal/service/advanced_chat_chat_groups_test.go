package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

func setupChatGroupHistoryTestDB(t *testing.T) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:chat-group-history-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("access database pool: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	t.Cleanup(func() { sqlDB.Close() })
	if err := db.AutoMigrate(
		&AdvancedChatChatGroupMember{},
		&AdvancedChatChatGroupMessage{},
		&AdvancedChatPrivateConversation{},
		&AdvancedChatPrivateMessage{},
		&AdvancedChatMemoryDocument{},
	); err != nil {
		t.Fatalf("migrate tables: %v", err)
	}
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
}

func seedChatGroupHistory(t *testing.T) AdvancedChatToolCallInput {
	t.Helper()
	base := time.Now().Add(-time.Hour)
	members := []AdvancedChatChatGroupMember{
		{ID: "member-a", GroupID: "group-1", UserID: 7, AgentID: "agent-a", AgentName: "Alpha", SessionID: "session-a", Status: chatGroupMemberIdle},
		{ID: "member-b", GroupID: "group-1", UserID: 7, AgentID: "agent-b", AgentName: "Beta", SessionID: "session-b", Status: chatGroupMemberIdle},
		{ID: "member-c", GroupID: "group-1", UserID: 7, AgentID: "agent-c", AgentName: "Gamma", SessionID: "session-c", Status: chatGroupMemberIdle},
	}
	if err := model.DB.Create(&members).Error; err != nil {
		t.Fatalf("seed members: %v", err)
	}
	groupMessages := []AdvancedChatChatGroupMessage{
		{ID: "group-old", GroupID: "group-1", UserID: 7, SenderType: chatGroupSenderUser, SenderName: "User", Content: "old roadmap", MentionMemberIDs: "[]", CreatedAt: base},
		{ID: "group-new", GroupID: "group-1", UserID: 7, SenderType: chatGroupSenderAgent, SenderID: "member-b", SenderName: "Beta", Content: "latest roadmap update", MentionMemberIDs: "[]", CreatedAt: base.Add(time.Minute)},
	}
	if err := model.DB.Create(&groupMessages).Error; err != nil {
		t.Fatalf("seed group messages: %v", err)
	}
	conversations := []AdvancedChatPrivateConversation{
		{ID: "conversation-ab", GroupID: "group-1", UserID: 7, MemberAID: "member-a", MemberBID: "member-b", MemberAName: "Alpha", MemberBName: "Beta", LastMessageAt: base.Add(3 * time.Minute)},
		{ID: "conversation-bc", GroupID: "group-1", UserID: 7, MemberAID: "member-b", MemberBID: "member-c", MemberAName: "Beta", MemberBName: "Gamma", LastMessageAt: base.Add(4 * time.Minute)},
	}
	if err := model.DB.Create(&conversations).Error; err != nil {
		t.Fatalf("seed conversations: %v", err)
	}
	privateMessages := []AdvancedChatPrivateMessage{
		{ID: "private-old", ConversationID: "conversation-ab", GroupID: "group-1", UserID: 7, SenderMemberID: "member-a", SenderName: "Alpha", RecipientMemberID: "member-b", Content: "old private roadmap", CreatedAt: base.Add(2 * time.Minute)},
		{ID: "private-new", ConversationID: "conversation-ab", GroupID: "group-1", UserID: 7, SenderMemberID: "member-b", SenderName: "Beta", RecipientMemberID: "member-a", Content: "latest private roadmap", CreatedAt: base.Add(3 * time.Minute)},
		{ID: "private-hidden", ConversationID: "conversation-bc", GroupID: "group-1", UserID: 7, SenderMemberID: "member-b", SenderName: "Beta", RecipientMemberID: "member-c", Content: "roadmap secret for Gamma", CreatedAt: base.Add(4 * time.Minute)},
	}
	if err := model.DB.Create(&privateMessages).Error; err != nil {
		t.Fatalf("seed private messages: %v", err)
	}
	return AdvancedChatToolCallInput{UserID: 7, SessionID: "session-a"}
}

func TestChatGroupHistoryToolsScopeAndOrder(t *testing.T) {
	setupChatGroupHistoryTestDB(t)
	input := seedChatGroupHistory(t)

	input.Arguments = map[string]interface{}{"limit": 2}
	result, err := handleChatGroupHistoryTool(context.Background(), input)
	if err != nil {
		t.Fatalf("read group history: %v", err)
	}
	var groupPayload struct {
		Order    string                         `json:"order"`
		Messages []AdvancedChatChatGroupMessage `json:"messages"`
	}
	if err := json.Unmarshal([]byte(result), &groupPayload); err != nil {
		t.Fatalf("decode group history: %v", err)
	}
	if groupPayload.Order != "newest_first" || len(groupPayload.Messages) != 2 || groupPayload.Messages[0].ID != "group-new" {
		t.Fatalf("unexpected group history: %+v", groupPayload)
	}

	input.Arguments = map[string]interface{}{"target_member_id": "member-b", "limit": 2}
	result, err = handleChatPrivateHistoryTool(context.Background(), input)
	if err != nil {
		t.Fatalf("read private history: %v", err)
	}
	var privatePayload struct {
		ConversationID string                       `json:"conversation_id"`
		Messages       []AdvancedChatPrivateMessage `json:"messages"`
	}
	if err := json.Unmarshal([]byte(result), &privatePayload); err != nil {
		t.Fatalf("decode private history: %v", err)
	}
	if privatePayload.ConversationID != "conversation-ab" || len(privatePayload.Messages) != 2 || privatePayload.Messages[0].ID != "private-new" {
		t.Fatalf("unexpected private history: %+v", privatePayload)
	}
	if _, err := handleChatPrivateHistoryTool(context.Background(), AdvancedChatToolCallInput{UserID: 7, SessionID: "session-a", Arguments: map[string]interface{}{"target_member_id": "member-a"}}); err == nil {
		t.Fatal("a member must not read a private conversation with itself")
	}
}

func TestChatGroupRuntimeExtensionIncludesStopProcessingTool(t *testing.T) {
	setupChatGroupHistoryTestDB(t)
	seedChatGroupHistory(t)
	extension, err := chatGroupRuntimeExtension(context.Background(), AdvancedChatRuntimeContext{UserID: 7, Mode: advancedChatModeAssistant, SessionID: "session-a"})
	if err != nil {
		t.Fatalf("load group extension: %v", err)
	}
	for _, tool := range extension.Tools {
		if tool.Name == chatGroupStopToolName {
			if !strings.Contains(extension.SystemPrompt, "stop_processing") {
				t.Fatal("group prompt must explain when to stop processing")
			}
			return
		}
	}
	t.Fatal("group assistants must receive the stop_processing tool")
}

func TestChatGroupHistorySearchKeepsPrivateConversationsIsolated(t *testing.T) {
	setupChatGroupHistoryTestDB(t)
	input := seedChatGroupHistory(t)
	input.Arguments = map[string]interface{}{"query": "roadmap", "scope": "all", "limit": 10}
	result, err := handleChatHistorySearchTool(context.Background(), input)
	if err != nil {
		t.Fatalf("search history: %v", err)
	}
	var payload struct {
		Results []chatHistorySearchResult `json:"results"`
	}
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		t.Fatalf("decode search results: %v", err)
	}
	if len(payload.Results) != 4 {
		t.Fatalf("expected public and own private results only, got %+v", payload.Results)
	}
	for _, item := range payload.Results {
		if strings.Contains(item.Content, "Gamma") || item.ConversationID == "conversation-bc" {
			t.Fatalf("search exposed another assistants' private conversation: %+v", item)
		}
	}
	if !payload.Results[0].CreatedAt.After(payload.Results[1].CreatedAt) {
		t.Fatalf("search results are not newest first: %+v", payload.Results)
	}
}

func TestGroupMembersKeepTheirMemoryScope(t *testing.T) {
	setupChatGroupHistoryTestDB(t)
	input := seedChatGroupHistory(t)
	memory := AdvancedChatMemoryDocument{ID: "memory-a", UserID: input.UserID, Scope: memoryScopeAgent, AgentID: "agent-a", Kind: "facts", Title: "Alpha facts", StoragePath: "unused.md", Enabled: true}
	if err := model.DB.Create(&memory).Error; err != nil {
		t.Fatalf("seed memory: %v", err)
	}
	extension, err := memoryRuntimeExtension(context.Background(), AdvancedChatRuntimeContext{UserID: input.UserID, AgentID: "agent-a", SessionID: input.SessionID, Mode: advancedChatModeAssistant})
	if err != nil {
		t.Fatalf("load memory extension: %v", err)
	}
	if !strings.Contains(extension.SystemPrompt, "memory-a") {
		t.Fatalf("current group member memory was not loaded: %s", extension.SystemPrompt)
	}
	foundMemoryTool := false
	for _, tool := range extension.Tools {
		if tool.Name == memoryToolRead {
			foundMemoryTool = true
			break
		}
	}
	if !foundMemoryTool {
		t.Fatal("memory tools must remain available to group members")
	}
}
