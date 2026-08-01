import { describe, expect, it } from "vitest";
import type { AuditEventOut } from "@arclayer/platform-openapi";

import {
  auditEventKey,
  auditOutcomeKey,
  auditSourceKey,
  auditTargetKey,
  presentRequest,
  requestStatusKey,
} from "@/monitoring/monitoring-presentation";

function auditEvent(properties?: AuditEventOut["properties"]): AuditEventOut {
  return {
    id: "event-1",
    eventName: "workspace.updated",
    occurredAt: "2026-08-01T10:00:00Z",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
    properties,
  };
}

describe("monitoring presentation", () => {
  it("turns technical routes into operator-facing service and action labels", () => {
    expect(
      presentRequest("POST", "/platform-api/v1/directory/workspaces/{workspace_id}/disable"),
    ).toEqual({
      areaKey: "REQUEST_AREA_WORKSPACES",
      actionKey: "REQUEST_ACTION_DISABLE",
    });
    expect(presentRequest("GET", "/platform-api/v1/monitoring/requests")).toEqual({
      areaKey: "REQUEST_AREA_MONITORING",
      actionKey: "REQUEST_ACTION_VIEW",
    });
  });

  it("presents request status without hiding the real status class", () => {
    expect(requestStatusKey(204)).toBe("REQUEST_STATUS_COMPLETED");
    expect(requestStatusKey(404)).toBe("REQUEST_STATUS_REJECTED");
    expect(requestStatusKey(503)).toBe("REQUEST_STATUS_FAILED");
  });

  it("uses product labels for known audit codes, sources, and targets", () => {
    expect(auditEventKey("workspace.updated")).toBe("AUDIT_EVENT_WORKSPACE_UPDATED");
    expect(auditSourceKey("auth_session")).toBe("AUDIT_SOURCE_SESSION");
    expect(auditTargetKey("workspace_skill")).toBe("AUDIT_TARGET_SKILL");
  });

  it("does not claim success when the audit event has no explicit outcome", () => {
    expect(auditOutcomeKey(auditEvent())).toBe("AUDIT_OUTCOME_RECORDED");
    expect(auditOutcomeKey(auditEvent({ status: "completed" }))).toBe("AUDIT_OUTCOME_COMPLETED");
    expect(auditOutcomeKey(auditEvent({ result: "failed" }))).toBe("AUDIT_OUTCOME_FAILED");
  });
});
