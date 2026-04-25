import type { AppLocale } from "@/lib/i18n";

export type WelcomeOnboardingStep = 1 | 2 | 3 | 4;
export type WelcomeMode = "real" | "dry-run";

export type RoleOption = {
  label: string;
  value: string;
};

export type InviteDraftRow = {
  id: string;
  email: string;
  roleCode: string;
  status: "idle" | "sent";
  error: string | null;
};

export type UserProfileDraft = {
  displayName: string;
  avatarUrl: string | null;
  avatarAssetId: string | null;
  locale: AppLocale;
  timezone: string;
};

export type WorkspaceDraft = {
  name: string;
  description: string;
  iconUrl: string | null;
  defaultRoleCode: string;
  locale: AppLocale;
  timezone: string;
  dateFormat: string;
  useRelativeDateTime: boolean;
};
