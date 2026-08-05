package model

import (
	"errors"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestUserBeforeCreateAllowsOnlyOneUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:single-user?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&User{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&User{Username: "owner", Email: "owner@example.com"}).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := db.Create(&User{Username: "second", Email: "second@example.com"}).Error; !errors.Is(err, ErrSingleUserOnly) {
		t.Fatalf("create second user error = %v, want %v", err, ErrSingleUserOnly)
	}
}
