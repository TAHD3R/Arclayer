import type { PageData } from "./common";
import type { SettingsSchemaItem } from "./settings";

export type SysStepUpResult = {
  token: string;
  expiresIn: number;
};

export type SysConfigNamespaceSummary = {
  namespace: string;
  kind: "core" | string;
  title: string;
  description?: string | null;
};

export type SysConfigDetail = {
  namespace: string;
  settingSchema: SettingsSchemaItem;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
  activeRevisionId?: string | null;
  revisionId?: string | null;
  updatedAt?: string | null;
};

export type SysConfigPatchPayload = {
  patch: Record<string, unknown>;
  activate?: boolean;
};

export type SysConfigActivatePayload = {
  revisionId: string;
};

export type SysConfigRevisionOut = {
  id: string;
  createdAt: string;
  updatedAt: string;
  namespace: string;
  baseRevisionId?: string | null;
  createdBy?: string | null;
  signature?: string | null;
  signingKeyFingerprint?: string | null;
};

export type SysConfigRevisionDetail = SysConfigRevisionOut & {
  signatureVerified?: boolean | null;
  signatureVerifyReason?: string | null;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
};

export type SysConfigTestCheck = {
  code: string;
  ok: boolean;
  kind: "config" | "connectivity" | "internal" | string;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

export type SysConfigTestResult = {
  ok: boolean;
  checks: SysConfigTestCheck[];
};

export type ListSysConfigNamespacesOut = PageData<SysConfigNamespaceSummary>;
export type ListSysConfigRevisionsOut = PageData<SysConfigRevisionOut>;
