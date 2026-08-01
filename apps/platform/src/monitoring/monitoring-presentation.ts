import type { AuditEventOut } from "@arclayer/platform-openapi";

type RequestPresentation = Readonly<{
  areaKey: string;
  actionKey: string;
}>;

const REQUEST_AREA_PATTERNS = [
  { pattern: /\/(auth|identity|access)(\/|$)/, key: "REQUEST_AREA_ACCESS" },
  { pattern: /\/workspaces?(\/|$)/, key: "REQUEST_AREA_WORKSPACES" },
  { pattern: /\/projects?(\/|$)/, key: "REQUEST_AREA_PROJECTS" },
  { pattern: /\/users?(\/|$)/, key: "REQUEST_AREA_USERS" },
  { pattern: /\/(commerce|billing|plans?|subscriptions?)(\/|$)/, key: "REQUEST_AREA_BILLING" },
  { pattern: /\/ai(\/|$)/, key: "REQUEST_AREA_AI" },
  { pattern: /\/extensions?(\/|$)/, key: "REQUEST_AREA_EXTENSIONS" },
  { pattern: /\/(communications?|feedback)(\/|$)/, key: "REQUEST_AREA_COMMUNICATIONS" },
  { pattern: /\/(site-delivery|hosting|domains?)(\/|$)/, key: "REQUEST_AREA_HOSTING" },
  { pattern: /\/(monitoring|observability|activity|audit)(\/|$)/, key: "REQUEST_AREA_MONITORING" },
  { pattern: /\/(operations?|attention|jobs?)(\/|$)/, key: "REQUEST_AREA_OPERATIONS" },
] as const;

const REQUEST_ACTION_PATTERNS = [
  { pattern: /\/(invite|invitations?)(\/|$)/, key: "REQUEST_ACTION_INVITE" },
  { pattern: /\/(transfer)(\/|$)/, key: "REQUEST_ACTION_TRANSFER" },
  { pattern: /\/(restore|enable|activate)(\/|$)/, key: "REQUEST_ACTION_ENABLE" },
  { pattern: /\/(archive|disable|revoke|offboard)(\/|$)/, key: "REQUEST_ACTION_DISABLE" },
  { pattern: /\/(retry|rerun)(\/|$)/, key: "REQUEST_ACTION_RETRY" },
  { pattern: /\/(preview)(\/|$)/, key: "REQUEST_ACTION_PREVIEW" },
] as const;

export function presentRequest(method: string, routeTemplate: string): RequestPresentation {
  const normalizedRoute = routeTemplate.toLowerCase();
  const areaKey =
    REQUEST_AREA_PATTERNS.find(({ pattern }) => pattern.test(normalizedRoute))?.key ??
    "REQUEST_AREA_PLATFORM";
  const explicitAction = REQUEST_ACTION_PATTERNS.find(({ pattern }) =>
    pattern.test(normalizedRoute),
  )?.key;
  if (explicitAction) return { areaKey, actionKey: explicitAction };

  const actionKey =
    method === "GET"
      ? "REQUEST_ACTION_VIEW"
      : method === "POST"
        ? "REQUEST_ACTION_CREATE"
        : method === "PATCH" || method === "PUT"
          ? "REQUEST_ACTION_UPDATE"
          : method === "DELETE"
            ? "REQUEST_ACTION_REMOVE"
            : "REQUEST_ACTION_PROCESS";
  return { areaKey, actionKey };
}

export function requestStatusKey(statusCode: number): string {
  if (statusCode >= 500) return "REQUEST_STATUS_FAILED";
  if (statusCode >= 400) return "REQUEST_STATUS_REJECTED";
  if (statusCode >= 300) return "REQUEST_STATUS_REDIRECTED";
  if (statusCode >= 200) return "REQUEST_STATUS_COMPLETED";
  return "REQUEST_STATUS_RECORDED";
}

const AUDIT_EVENT_KEYS: Readonly<Record<string, string>> = {
  "auth.login": "AUDIT_EVENT_SIGNED_IN",
  "auth.mfa.enabled": "AUDIT_EVENT_MFA_ENABLED",
  "permission.assignment.changed": "AUDIT_EVENT_ACCESS_CHANGED",
  "workspace.updated": "AUDIT_EVENT_WORKSPACE_UPDATED",
  "workspace.skill.installed": "AUDIT_EVENT_SKILL_INSTALLED",
  "workspace.created": "AUDIT_EVENT_WORKSPACE_CREATED",
  "platform.instance_owner.bootstrapped": "AUDIT_EVENT_OWNER_ESTABLISHED",
};

export function auditEventKey(eventName: string): string {
  return AUDIT_EVENT_KEYS[eventName] ?? "AUDIT_EVENT_PLATFORM_CHANGE";
}

export function auditSourceKey(source: string | null | undefined): string {
  if (source === "auth_session") return "AUDIT_SOURCE_SESSION";
  if (source === "worker") return "AUDIT_SOURCE_BACKGROUND";
  if (source === "system") return "AUDIT_SOURCE_SYSTEM";
  if (source === "admin" || source === "platform_console") return "AUDIT_SOURCE_CONSOLE";
  if (source === "api") return "AUDIT_SOURCE_PLATFORM";
  return "AUDIT_SOURCE_PLATFORM";
}

export function auditTargetKey(entityType: string | null | undefined): string {
  const normalized = entityType?.toLowerCase() ?? "";
  if (normalized.includes("skill")) return "AUDIT_TARGET_SKILL";
  if (normalized.includes("workspace")) return "AUDIT_TARGET_WORKSPACE";
  if (normalized.includes("project")) return "AUDIT_TARGET_PROJECT";
  if (normalized.includes("user")) return "AUDIT_TARGET_USER";
  if (normalized.includes("session")) return "AUDIT_TARGET_SESSION";
  if (normalized.includes("role") || normalized.includes("permission")) {
    return "AUDIT_TARGET_ACCESS";
  }
  if (normalized.includes("invitation")) return "AUDIT_TARGET_INVITATION";
  if (normalized.includes("subscription") || normalized.includes("plan")) {
    return "AUDIT_TARGET_SUBSCRIPTION";
  }
  if (normalized.includes("instance")) return "AUDIT_TARGET_INSTANCE";
  return "AUDIT_TARGET_PLATFORM";
}

function outcomeValue(event: AuditEventOut): string | null {
  const properties = event.properties;
  if (!properties) return null;
  for (const key of ["outcome", "status", "result"] as const) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
  }
  return null;
}

export function auditOutcomeKey(event: AuditEventOut): string {
  const value = outcomeValue(event);
  if (!value) return "AUDIT_OUTCOME_RECORDED";
  if (["success", "succeeded", "completed", "applied", "accepted"].includes(value)) {
    return "AUDIT_OUTCOME_COMPLETED";
  }
  if (["failed", "failure", "error"].includes(value)) return "AUDIT_OUTCOME_FAILED";
  if (["rejected", "denied", "cancelled", "canceled"].includes(value)) {
    return "AUDIT_OUTCOME_REJECTED";
  }
  if (["pending", "queued", "running", "in_progress"].includes(value)) {
    return "AUDIT_OUTCOME_PENDING";
  }
  return "AUDIT_OUTCOME_RECORDED";
}
