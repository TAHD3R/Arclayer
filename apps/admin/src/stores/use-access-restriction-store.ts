import { create } from "zustand";

import type { ApiError } from "@/lib/http/errors";

export const ACCESS_RESTRICTION_CODES = [
  "USER_DISABLED",
  "WORKSPACE_SUSPENDED",
  "WORKSPACE_ARCHIVED",
  "PROJECT_SUSPENDED",
] as const;

export type AccessRestrictionCode = (typeof ACCESS_RESTRICTION_CODES)[number];

export type AccessRestrictionSnapshot = {
  restrictionId: string;
  entityType: "user" | "workspace" | "project";
  entityId: string;
  restrictionType:
    | "user_disabled"
    | "workspace_suspended"
    | "workspace_archived"
    | "project_suspended";
  state: "active";
  reasonCategory: string;
  reasonCode: string;
  effectiveAt: string;
  reviewAt: string | null;
  expiresAt: string | null;
  revision: number;
  supportAvailable: boolean;
  allowedRecoveryActions: string[];
};

export type ActiveAccessRestriction = {
  code: AccessRestrictionCode;
  message: string;
  restriction: AccessRestrictionSnapshot | null;
};

type AccessRestrictionState = {
  active: ActiveAccessRestriction | null;
  captureApiError: (error: ApiError) => boolean;
  clear: () => void;
};

const RESTRICTION_CODE_SET = new Set<string>(ACCESS_RESTRICTION_CODES);

export function parseAccessRestrictionError(error: ApiError): ActiveAccessRestriction | null {
  if (error.status !== 403 || !error.error || !RESTRICTION_CODE_SET.has(error.error)) {
    return null;
  }

  return {
    code: error.error as AccessRestrictionCode,
    message: error.message,
    restriction: parseRestrictionSnapshot(error.meta),
  };
}

export const useAccessRestrictionStore = create<AccessRestrictionState>((set) => ({
  active: null,
  captureApiError: (error) => {
    const active = parseAccessRestrictionError(error);
    if (!active) return false;
    set({ active });
    return true;
  },
  clear: () => set({ active: null }),
}));

function parseRestrictionSnapshot(meta: unknown): AccessRestrictionSnapshot | null {
  const restriction = readRecord(readRecord(meta)?.restriction);
  if (!restriction) return null;

  const restrictionId = readString(restriction.restrictionId);
  const entityType = readEntityType(restriction.entityType);
  const entityId = readString(restriction.entityId);
  const restrictionType = readRestrictionType(restriction.restrictionType);
  const reasonCategory = readString(restriction.reasonCategory);
  const reasonCode = readString(restriction.reasonCode);
  const effectiveAt = readString(restriction.effectiveAt);
  const revision = readPositiveInteger(restriction.revision);
  if (
    !restrictionId ||
    !entityType ||
    !entityId ||
    !restrictionType ||
    restriction.state !== "active" ||
    !reasonCategory ||
    !reasonCode ||
    !effectiveAt ||
    !revision
  ) {
    return null;
  }

  return {
    restrictionId,
    entityType,
    entityId,
    restrictionType,
    state: "active",
    reasonCategory,
    reasonCode,
    effectiveAt,
    reviewAt: readNullableString(restriction.reviewAt),
    expiresAt: readNullableString(restriction.expiresAt),
    revision,
    supportAvailable: restriction.supportAvailable !== false,
    allowedRecoveryActions: readStringArray(restriction.allowedRecoveryActions),
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : readString(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readEntityType(value: unknown): AccessRestrictionSnapshot["entityType"] | null {
  return value === "user" || value === "workspace" || value === "project" ? value : null;
}

function readRestrictionType(value: unknown): AccessRestrictionSnapshot["restrictionType"] | null {
  return value === "user_disabled" ||
    value === "workspace_suspended" ||
    value === "workspace_archived" ||
    value === "project_suspended"
    ? value
    : null;
}
