import type { TFunction } from "i18next";

import { resolveCatalogEntry } from "@/pages/workspaces/shared/activity/constants";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

const SOURCE_KEYS: Readonly<Record<string, string>> = {
  api: "AUDIT_SOURCE_API",
  core: "AUDIT_SOURCE_CORE",
  agent: "AUDIT_SOURCE_AGENT",
  agent_run: "AUDIT_SOURCE_AGENT",
  agent_run_stream: "AUDIT_SOURCE_AGENT",
  agent_runtime_command: "AUDIT_SOURCE_AGENT",
  agent_thread: "AUDIT_SOURCE_AGENT",
  job: "AUDIT_SOURCE_JOB",
  "job-dispatcher": "AUDIT_SOURCE_JOB",
  "job-executor": "AUDIT_SOURCE_JOB",
  "job-terminal": "AUDIT_SOURCE_JOB",
  request_log: "AUDIT_SOURCE_REQUEST",
  "asset-upload": "AUDIT_SOURCE_ASSET_UPLOAD",
  "workspace-knowledge": "AUDIT_SOURCE_WORKSPACE_KNOWLEDGE",
  "workspace-skills": "AUDIT_SOURCE_WORKSPACE_SKILLS",
};

const ENTITY_KEYS: Readonly<Record<string, string>> = {
  asset: "AUDIT_ENTITY_ASSET",
  asset_folder: "AUDIT_ENTITY_ASSET_FOLDER",
  content_item: "AUDIT_ENTITY_CONTENT_ITEM",
  content_model: "AUDIT_ENTITY_CONTENT_MODEL",
  deployment: "AUDIT_ENTITY_DEPLOYMENT",
  feedback_ticket: "AUDIT_ENTITY_FEEDBACK",
  project: "AUDIT_ENTITY_PROJECT",
  release: "AUDIT_ENTITY_RELEASE",
  user: "AUDIT_ENTITY_USER",
  workspace: "AUDIT_ENTITY_WORKSPACE",
};

const TARGET_PROPERTY_KEYS = [
  "name",
  "title",
  "displayName",
  "display_name",
  "slug",
  "email",
  "filename",
  "fileName",
  "model",
  "provider",
] as const;

export function auditEventName(t: TFunction, eventName: string) {
  const entry = resolveCatalogEntry(eventName);
  return entry ? t(`activity:${entry.titleKey}`) : eventName;
}

export function auditSourceLabel(t: TFunction, source: string | null | undefined) {
  const normalized = source?.trim();
  if (!normalized) return t("platform:AUDIT_SOURCE_UNKNOWN");
  const key = SOURCE_KEYS[normalized];
  return key ? t(`platform:${key}`) : normalized;
}

export function auditScopeLabel(
  t: TFunction,
  event: ActivityEvent,
  workspaceLabelById: Readonly<Record<string, string>>,
  projectLabelById: Readonly<Record<string, string>>,
) {
  if (event.projectId) {
    return projectLabelById[event.projectId] ?? event.projectId;
  }
  if (event.workspaceId) {
    return workspaceLabelById[event.workspaceId] ?? event.workspaceId;
  }
  return t("platform:AUDIT_GLOBAL_SCOPE");
}

function targetProperty(event: ActivityEvent) {
  const properties = event.properties as Record<string, unknown> | null | undefined;
  for (const key of TARGET_PROPERTY_KEYS) {
    const value = properties?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function auditTargetLabel(t: TFunction, event: ActivityEvent) {
  const entityType = event.entityType?.trim();
  const entityKey = entityType ? ENTITY_KEYS[entityType] : undefined;
  const typeLabel = entityKey
    ? t(`platform:${entityKey}`)
    : entityType || t("platform:AUDIT_TARGET_UNSPECIFIED");
  const detail = targetProperty(event) ?? event.entityId;
  return detail ? `${typeLabel} · ${detail}` : typeLabel;
}
