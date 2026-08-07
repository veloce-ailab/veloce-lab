package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestMigrateDatabaseCreatesPersonalCompanyTables(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:production-personal-company-migration?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("access test database connection: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if err := migrateDatabase(db); err != nil {
		t.Fatalf("run production database migration: %v", err)
	}

	tables := []struct {
		name  string
		model any
	}{
		{"personal_companies", &PersonalCompany{}},
		{"company_charter_revisions", &CompanyCharterRevision{}},
		{"personal_company_employees", &PersonalCompanyEmployee{}},
		{"company_role_templates", &CompanyRoleTemplate{}},
		{"company_employee_versions", &CompanyEmployeeVersion{}},
		{"company_capability_evidences", &CompanyCapabilityEvidence{}},
		{"company_recruitment_plans", &CompanyRecruitmentPlan{}},
		{"company_objectives", &CompanyObjective{}},
		{"company_work_items", &CompanyWorkItem{}},
		{"company_work_attempts", &CompanyWorkAttempt{}},
		{"company_artifacts", &CompanyArtifact{}},
		{"company_handoff_packages", &CompanyHandoffPackage{}},
		{"company_approval_requests", &CompanyApprovalRequest{}},
		{"company_budget_ledgers", &CompanyBudgetLedger{}},
		{"company_audit_events", &CompanyAuditEvent{}},
		{"company_signals", &CompanySignal{}},
		{"company_outbox_events", &CompanyOutboxEvent{}},
	}

	for _, table := range tables {
		t.Run(table.name, func(t *testing.T) {
			if !db.Migrator().HasTable(table.model) {
				t.Fatalf("production migration did not create table %q", table.name)
			}
		})
	}
}
