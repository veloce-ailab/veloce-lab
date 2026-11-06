import assert from "node:assert/strict";
import test from "node:test";
import {
  connectorApprovalMode,
  connectorTaskIsSandboxed,
  connectorTaskNeedsApproval,
  DEFAULT_CONNECTOR_APPROVAL_MODE,
} from "../dist/approval.js";

test("sessions start in sandbox mode", () => {
  assert.equal(DEFAULT_CONNECTOR_APPROVAL_MODE, "sandbox");
  assert.equal(connectorApprovalMode(undefined), "sandbox");
  assert.equal(connectorApprovalMode({}), "sandbox");
  assert.equal(connectorTaskIsSandboxed({}), true);
});

test("the retired names resolve to the sandbox rather than to a prompt", () => {
  for (const retired of ["manual", "safe", "", "nonsense"]) {
    assert.equal(connectorApprovalMode({ approval_mode: retired }), "sandbox", retired);
    assert.equal(connectorTaskNeedsApproval({ approval_mode: retired }), false, retired);
  }
});

test("full access is still the one mode that confines nothing", () => {
  assert.equal(connectorApprovalMode({ approval_mode: "full_access" }), "full_access");
  assert.equal(connectorTaskIsSandboxed({ approval_mode: "full_access" }), false);
  assert.equal(connectorTaskNeedsApproval({ approval_mode: "full_access" }), false);
  // The pre-mode flag means the same thing.
  assert.equal(connectorApprovalMode({}, true), "full_access");
  assert.equal(connectorApprovalMode({ auto_approve: true }), "full_access");
});

test("only the approving assistant makes a task wait", () => {
  assert.equal(connectorTaskNeedsApproval({ approval_mode: "assistant" }), true);
  assert.equal(connectorTaskIsSandboxed({ approval_mode: "assistant" }), false);
});
