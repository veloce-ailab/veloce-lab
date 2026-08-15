package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

type advancedChatKnowledgeTextDocumentInput struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

func (api *advancedChatAPI) createKnowledgeTextDocument(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	base, found := loadAdvancedChatKnowledgeBase(c, user.ID, c.Param("id"))
	if !found {
		return
	}
	var input advancedChatKnowledgeTextDocumentInput
	if c.ShouldBindJSON(&input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	name, err := normalizeKnowledgeEditableDocumentName(input.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	content := input.Content
	if content == "" {
		content = "\n"
	}
	documentID := newAdvancedChatID("akd")
	file, status, message, err := storeAdvancedChatFile(user.ID, advancedChatFileStoreInput{Name: name, MIMEType: "text/markdown", Data: []byte(content), Source: advancedChatKnowledgeDocumentSource, SourceKey: "knowledge:" + base.ID + ":" + documentID, RequireAllowedType: true})
	if err != nil {
		c.JSON(status, gin.H{"error": message})
		return
	}
	document := AdvancedChatKnowledgeDocument{ID: documentID, KnowledgeBaseID: base.ID, UserID: user.ID, FileID: file.ID, Name: file.Name, MIMEType: file.MIMEType, Size: file.Size, TextAvailable: true, EmbeddingStatus: advancedChatKnowledgeEmbeddingPending}
	if err := model.DB.Create(&document).Error; err != nil {
		deleteAdvancedChatKnowledgeFile(user.ID, file.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save knowledge document"})
		return
	}
	queueAdvancedChatKnowledgeEmbedding(document.ID)
	c.JSON(http.StatusCreated, gin.H{"document": advancedChatKnowledgeDocumentResponseFromModel(document)})
}

func (api *advancedChatAPI) getKnowledgeDocumentContent(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	base, found := loadAdvancedChatKnowledgeBase(c, user.ID, c.Param("id"))
	if !found {
		return
	}
	document, file, found := loadKnowledgeEditableDocument(c, user.ID, base.ID, c.Param("document_id"))
	if !found {
		return
	}
	data, err := advancedChatFileData(*file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read knowledge document"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"document": advancedChatKnowledgeDocumentResponseFromModel(*document), "content": string(data), "editable": true})
}

func (api *advancedChatAPI) updateKnowledgeDocumentContent(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	base, found := loadAdvancedChatKnowledgeBase(c, user.ID, c.Param("id"))
	if !found {
		return
	}
	document, file, found := loadKnowledgeEditableDocument(c, user.ID, base.ID, c.Param("document_id"))
	if !found {
		return
	}
	var input advancedChatKnowledgeTextDocumentInput
	if c.ShouldBindJSON(&input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	name := file.Name
	if strings.TrimSpace(input.Name) != "" {
		var err error
		name, err = normalizeKnowledgeEditableDocumentName(input.Name)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	data := []byte(input.Content)
	textExtract := advancedChatFileTextExtract(data, "text/markdown", name)
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("document_id = ? AND user_id = ?", document.ID, user.ID).Delete(&AdvancedChatKnowledgeChunk{}).Error; err != nil {
			return err
		}
		if err := tx.Model(file).Updates(map[string]interface{}{"name": name, "mime_type": "text/markdown", "size": int64(len(data)), "data": data, "storage_path": "", "text_extract": textExtract}).Error; err != nil {
			return err
		}
		return tx.Model(document).Updates(map[string]interface{}{"name": name, "mime_type": "text/markdown", "size": int64(len(data)), "text_available": true, "embedding_status": advancedChatKnowledgeEmbeddingPending, "embedding_error": "", "embedding_model": "", "embedding_dim": 0, "chunk_count": 0, "embedded_at": nil}).Error
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update knowledge document"})
		return
	}
	if file.StoragePath != "" {
		_ = removeAdvancedChatStoragePath(file.StoragePath)
	}
	document.Name, document.MIMEType, document.Size, document.TextAvailable = name, "text/markdown", int64(len(data)), true
	document.EmbeddingStatus, document.EmbeddingError, document.EmbeddingModel, document.EmbeddingDim, document.ChunkCount, document.EmbeddedAt = advancedChatKnowledgeEmbeddingPending, "", "", 0, 0, nil
	queueAdvancedChatKnowledgeEmbedding(document.ID)
	c.JSON(http.StatusOK, gin.H{"document": advancedChatKnowledgeDocumentResponseFromModel(*document)})
}

func loadKnowledgeEditableDocument(c *gin.Context, userID uint, baseID, documentID string) (*AdvancedChatKnowledgeDocument, *AdvancedChatFile, bool) {
	var document AdvancedChatKnowledgeDocument
	if err := model.DB.Where("id = ? AND knowledge_base_id = ? AND user_id = ?", strings.TrimSpace(documentID), baseID, userID).First(&document).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Knowledge document not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load knowledge document"})
		}
		return nil, nil, false
	}
	if !advancedChatFileTextLike(document.MIMEType, document.Name) {
		c.JSON(http.StatusConflict, gin.H{"error": "Only text documents can be edited online"})
		return nil, nil, false
	}
	var file AdvancedChatFile
	if err := model.DB.Where("id = ? AND user_id = ? AND source = ?", document.FileID, userID, advancedChatKnowledgeDocumentSource).First(&file).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Knowledge file not found"})
		return nil, nil, false
	}
	return &document, &file, true
}

func normalizeKnowledgeEditableDocumentName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", errors.New("document name is required")
	}
	if strings.ContainsAny(name, "/\\\x00") || name == "." || name == ".." || len([]rune(name)) > 255 {
		return "", errors.New("invalid document name")
	}
	if !strings.Contains(name, ".") {
		name += ".md"
	}
	if !advancedChatFileTextLike("text/markdown", name) {
		return "", errors.New("only text documents can be created online")
	}
	return name, nil
}

func migrateLegacyWorkspacesToKnowledgeBases() error {
	if !advancedChatFileStorageEnabled() || !model.DB.Migrator().HasTable(&AdvancedChatWorkspace{}) {
		return nil
	}
	var workspaces []AdvancedChatWorkspace
	if err := model.DB.Order("id ASC").Find(&workspaces).Error; err != nil {
		return err
	}
	for _, workspace := range workspaces {
		var base AdvancedChatKnowledgeBase
		err := model.DB.Where("legacy_workspace_id = ?", workspace.ID).First(&base).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			base = AdvancedChatKnowledgeBase{ID: newAdvancedChatID("akb"), UserID: workspace.UserID, Name: uniqueLegacyKnowledgeBaseName(workspace.UserID, workspace.Name), Description: "由旧工作区迁移，现可在知识库中直接编辑文档。", LegacyWorkspaceID: workspace.ID}
			if err := model.DB.Create(&base).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		var files []AdvancedChatWorkspaceFile
		if err := model.DB.Where("workspace_id = ? AND user_id = ?", workspace.ID, workspace.UserID).Order("id ASC").Find(&files).Error; err != nil {
			return err
		}
		for _, legacyFile := range files {
			var existing AdvancedChatKnowledgeDocument
			if err := model.DB.Where("legacy_workspace_file_id = ?", legacyFile.ID).First(&existing).Error; err == nil {
				continue
			} else if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			name, err := normalizeKnowledgeEditableDocumentName(legacyFile.Name)
			if err != nil {
				name = "迁移文档.md"
			}
			content := legacyFile.Content
			if content == "" {
				content = "\n"
			}
			documentID := newAdvancedChatID("akd")
			file, _, _, err := storeAdvancedChatFile(workspace.UserID, advancedChatFileStoreInput{Name: name, MIMEType: "text/markdown", Data: []byte(content), Source: advancedChatKnowledgeDocumentSource, SourceKey: "knowledge:" + base.ID + ":" + documentID, RequireAllowedType: true})
			if err != nil {
				return err
			}
			document := AdvancedChatKnowledgeDocument{ID: documentID, KnowledgeBaseID: base.ID, UserID: workspace.UserID, FileID: file.ID, Name: file.Name, MIMEType: file.MIMEType, Size: file.Size, TextAvailable: true, EmbeddingStatus: advancedChatKnowledgeEmbeddingPending, LegacyWorkspaceFileID: legacyFile.ID}
			if err := model.DB.Create(&document).Error; err != nil {
				deleteAdvancedChatKnowledgeFile(workspace.UserID, file.ID)
				return err
			}
			queueAdvancedChatKnowledgeEmbedding(document.ID)
		}
	}
	return nil
}

func uniqueLegacyKnowledgeBaseName(userID uint, raw string) string {
	base := strings.TrimSpace(raw)
	if base == "" {
		base = "迁移的工作区"
	}
	if len([]rune(base)) > 112 {
		base = string([]rune(base)[:112])
	}
	for candidate, index := base, 2; ; index++ {
		var count int64
		if err := model.DB.Model(&AdvancedChatKnowledgeBase{}).Where("user_id = ? AND name = ?", userID, candidate).Count(&count).Error; err != nil || count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s (%d)", base, index)
	}
}
