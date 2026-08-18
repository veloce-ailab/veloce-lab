package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveJWTSecretUsesConfiguredValue(t *testing.T) {
	t.Setenv("JWT_SECRET", "a-real-secret")
	if secret := resolveJWTSecret("production"); secret != "a-real-secret" {
		t.Fatalf("resolveJWTSecret = %q, want the configured secret", secret)
	}
}

func TestResolveJWTSecretNeverReturnsPlaceholder(t *testing.T) {
	for _, value := range []string{"", placeholderJWTSecret, "  " + placeholderJWTSecret + "  "} {
		t.Setenv("JWT_SECRET", value)
		secret := resolveJWTSecret("development")
		if secret == placeholderJWTSecret || secret == "" {
			t.Fatalf("resolveJWTSecret(%q) = %q, want a generated secret", value, secret)
		}
		if len(secret) != 64 {
			t.Fatalf("generated secret length = %d, want 64 hex chars", len(secret))
		}
	}
}

func TestResolveJWTSecretGeneratesDistinctSecrets(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	first := resolveJWTSecret("development")
	second := resolveJWTSecret("development")
	if first == second {
		t.Fatal("generated secrets must differ between calls")
	}
}

func TestResolveJWTSecretWithDataPathPersistsDevelopmentSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "")
	dataPath := t.TempDir()
	first := resolveJWTSecretWithDataPath("development", dataPath)
	second := resolveJWTSecretWithDataPath("development", dataPath)
	if first != second {
		t.Fatal("development signing secret must survive a restart")
	}
	if _, err := os.Stat(filepath.Join(dataPath, ".jwt_secret")); err != nil {
		t.Fatalf("persisted development secret: %v", err)
	}
}

func TestRequiresSecureSecrets(t *testing.T) {
	// An unset APP_ENV reads as development-like, which is why an unset
	// JWT_SECRET must still never fall back to the published placeholder.
	for _, env := range []string{"", "development", "dev", "local", "test"} {
		if requiresSecureSecrets(env) {
			t.Fatalf("requiresSecureSecrets(%q) = true, want false", env)
		}
	}
	for _, env := range []string{"production", "prod", "staging"} {
		if !requiresSecureSecrets(env) {
			t.Fatalf("requiresSecureSecrets(%q) = false, want true", env)
		}
	}
}
