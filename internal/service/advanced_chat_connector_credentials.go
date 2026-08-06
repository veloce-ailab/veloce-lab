package service

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/veloce-ailab/veloce/internal/model"
	"gorm.io/gorm"
)

const (
	connectorCredentialTypeEnvironment = "environment"
	connectorCredentialTypeHTTPHeader  = "http_header"
)

var connectorEnvironmentKeyPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
var connectorHTTPHeaderKeyPattern = regexp.MustCompile(`^[!#$%&'*+.^_` + "`" + `|~0-9A-Za-z-]{1,160}$`)

// AdvancedChatConnectorCredential stores a user-owned value that can be
// selectively attached to one or more connector devices. Values are never
// returned from management APIs or task history.
type AdvancedChatConnectorCredential struct {
	ID        string    `gorm:"primaryKey;size:80" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"-"`
	Name      string    `gorm:"size:120;not null" json:"name"`
	Type      string    `gorm:"size:20;index;not null" json:"type"`
	Key       string    `gorm:"size:160;not null" json:"key"`
	Value     string    `gorm:"type:text;not null" json:"-"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AdvancedChatConnectorCredentialBinding struct {
	ID           string    `gorm:"primaryKey;size:80" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"-"`
	DeviceID     string    `gorm:"uniqueIndex:idx_connector_credential_binding;size:80;not null" json:"device_id"`
	CredentialID string    `gorm:"uniqueIndex:idx_connector_credential_binding;size:80;not null" json:"credential_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type advancedChatConnectorCredentialInput struct {
	Name  string  `json:"name"`
	Type  string  `json:"type"`
	Key   string  `json:"key"`
	Value *string `json:"value"`
}

type advancedChatConnectorCredentialBindingInput struct {
	CredentialIDs []string `json:"credential_ids"`
}

type advancedChatConnectorCredentialResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Key       string    `json:"key"`
	ValueSet  bool      `json:"value_set"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func init() {
	model.RegisterSQLiteMigrationModels(&AdvancedChatConnectorCredential{}, &AdvancedChatConnectorCredentialBinding{})
}

func (api *advancedChatAPI) listConnectorCredentials(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	credentials, err := connectorCredentialsForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list connector credentials"})
		return
	}
	c.JSON(http.StatusOK, connectorCredentialResponses(credentials))
}

func (api *advancedChatAPI) createConnectorCredential(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input advancedChatConnectorCredentialInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	credential, status, message, err := saveConnectorCredential(user.ID, "", input)
	if err != nil {
		c.JSON(status, gin.H{"error": message})
		return
	}
	c.JSON(http.StatusCreated, connectorCredentialResponse(credential))
}

func (api *advancedChatAPI) updateConnectorCredential(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input advancedChatConnectorCredentialInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	credential, status, message, err := saveConnectorCredential(user.ID, c.Param("id"), input)
	if err != nil {
		c.JSON(status, gin.H{"error": message})
		return
	}
	c.JSON(http.StatusOK, connectorCredentialResponse(credential))
}

func (api *advancedChatAPI) deleteConnectorCredential(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	credentialID := strings.TrimSpace(c.Param("id"))
	if credentialID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Credential id is required"})
		return
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("credential_id = ? AND user_id = ?", credentialID, user.ID).Delete(&AdvancedChatConnectorCredentialBinding{}).Error; err != nil {
			return err
		}
		result := tx.Where("id = ? AND user_id = ?", credentialID, user.ID).Delete(&AdvancedChatConnectorCredential{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Credential not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete connector credential"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func (api *advancedChatAPI) listConnectorDeviceCredentials(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	device, found := loadConnectorDeviceForResponse(c, user.ID)
	if !found {
		return
	}
	credentials, err := connectorCredentialsForUser(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list connector credentials"})
		return
	}
	boundIDs, err := connectorCredentialIDsForDevice(user.ID, device.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load connector credentials"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"credentials": connectorCredentialResponses(credentials), "credential_ids": boundIDs})
}

func (api *advancedChatAPI) updateConnectorDeviceCredentials(c *gin.Context) {
	user, ok := currentAdvancedChatUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	device, found := loadConnectorDeviceForResponse(c, user.ID)
	if !found {
		return
	}
	var input advancedChatConnectorCredentialBindingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ids := uniqueConnectorCredentialIDs(input.CredentialIDs)
	if len(ids) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "A connector can use at most 50 credentials"})
		return
	}
	if len(ids) > 0 {
		var count int64
		if err := model.DB.Model(&AdvancedChatConnectorCredential{}).Where("user_id = ? AND id IN ?", user.ID, ids).Count(&count).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate connector credentials"})
			return
		}
		if int(count) != len(ids) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "One or more credentials were not found"})
			return
		}
	}
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND device_id = ?", user.ID, device.ID).Delete(&AdvancedChatConnectorCredentialBinding{}).Error; err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		bindings := make([]AdvancedChatConnectorCredentialBinding, 0, len(ids))
		for _, credentialID := range ids {
			bindings = append(bindings, AdvancedChatConnectorCredentialBinding{ID: newAdvancedChatID("accb"), UserID: user.ID, DeviceID: device.ID, CredentialID: credentialID})
		}
		return tx.Create(&bindings).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update connector credentials"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"credential_ids": ids})
}

func connectorCredentialsForUser(userID uint) ([]AdvancedChatConnectorCredential, error) {
	var credentials []AdvancedChatConnectorCredential
	err := model.DB.Where("user_id = ?", userID).Order("name ASC, created_at ASC").Find(&credentials).Error
	return credentials, err
}

func connectorCredentialIDsForDevice(userID uint, deviceID string) ([]string, error) {
	var bindings []AdvancedChatConnectorCredentialBinding
	if err := model.DB.Where("user_id = ? AND device_id = ?", userID, deviceID).Order("created_at ASC").Find(&bindings).Error; err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(bindings))
	for _, binding := range bindings {
		ids = append(ids, binding.CredentialID)
	}
	return ids, nil
}

func saveConnectorCredential(userID uint, id string, input advancedChatConnectorCredentialInput) (AdvancedChatConnectorCredential, int, string, error) {
	name := truncateConnectorField(input.Name, 120)
	credentialType := normalizeConnectorCredentialType(input.Type)
	key := strings.TrimSpace(input.Key)
	if name == "" {
		return AdvancedChatConnectorCredential{}, http.StatusBadRequest, "Credential name is required", errors.New("credential name is required")
	}
	if credentialType == "" {
		return AdvancedChatConnectorCredential{}, http.StatusBadRequest, "Credential type must be environment or http_header", errors.New("invalid credential type")
	}
	if !validConnectorCredentialKey(credentialType, key) {
		return AdvancedChatConnectorCredential{}, http.StatusBadRequest, "Credential key is invalid", errors.New("invalid credential key")
	}
	if len([]rune(key)) > 160 {
		return AdvancedChatConnectorCredential{}, http.StatusBadRequest, "Credential key is too long", errors.New("credential key too long")
	}
	if input.Value != nil && len([]byte(*input.Value)) > 16*1024 {
		return AdvancedChatConnectorCredential{}, http.StatusRequestEntityTooLarge, "Credential value is too large", errors.New("credential value too large")
	}
	if id == "" {
		if input.Value == nil || strings.TrimSpace(*input.Value) == "" {
			return AdvancedChatConnectorCredential{}, http.StatusBadRequest, "Credential value is required", errors.New("credential value is required")
		}
		credential := AdvancedChatConnectorCredential{ID: newAdvancedChatID("acc"), UserID: userID, Name: name, Type: credentialType, Key: key, Value: *input.Value}
		if err := model.DB.Create(&credential).Error; err != nil {
			return AdvancedChatConnectorCredential{}, http.StatusInternalServerError, "Failed to save credential", err
		}
		return credential, http.StatusCreated, "", nil
	}
	var credential AdvancedChatConnectorCredential
	if err := model.DB.Where("id = ? AND user_id = ?", strings.TrimSpace(id), userID).First(&credential).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return AdvancedChatConnectorCredential{}, http.StatusNotFound, "Credential not found", err
		}
		return AdvancedChatConnectorCredential{}, http.StatusInternalServerError, "Failed to load credential", err
	}
	updates := map[string]interface{}{"name": name, "type": credentialType, "key": key, "updated_at": time.Now()}
	if input.Value != nil && strings.TrimSpace(*input.Value) != "" {
		updates["value"] = *input.Value
	}
	if err := model.DB.Model(&credential).Updates(updates).Error; err != nil {
		return AdvancedChatConnectorCredential{}, http.StatusInternalServerError, "Failed to save credential", err
	}
	if err := model.DB.Where("id = ? AND user_id = ?", credential.ID, userID).First(&credential).Error; err != nil {
		return AdvancedChatConnectorCredential{}, http.StatusInternalServerError, "Failed to load credential", err
	}
	return credential, http.StatusOK, "", nil
}

func normalizeConnectorCredentialType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case connectorCredentialTypeEnvironment:
		return connectorCredentialTypeEnvironment
	case connectorCredentialTypeHTTPHeader:
		return connectorCredentialTypeHTTPHeader
	default:
		return ""
	}
}

func validConnectorCredentialKey(credentialType, key string) bool {
	if credentialType == connectorCredentialTypeEnvironment {
		return connectorEnvironmentKeyPattern.MatchString(key)
	}
	return connectorHTTPHeaderKeyPattern.MatchString(key)
}

func uniqueConnectorCredentialIDs(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func connectorCredentialResponse(credential AdvancedChatConnectorCredential) advancedChatConnectorCredentialResponse {
	return advancedChatConnectorCredentialResponse{ID: credential.ID, Name: credential.Name, Type: credential.Type, Key: credential.Key, ValueSet: strings.TrimSpace(credential.Value) != "", CreatedAt: credential.CreatedAt, UpdatedAt: credential.UpdatedAt}
}

func connectorCredentialResponses(credentials []AdvancedChatConnectorCredential) []advancedChatConnectorCredentialResponse {
	result := make([]advancedChatConnectorCredentialResponse, 0, len(credentials))
	for _, credential := range credentials {
		result = append(result, connectorCredentialResponse(credential))
	}
	return result
}
