import type { AppLocale } from "@/lib/i18n";
import type { OnboardingProfilePatchRequest } from "@arclayer/openapi";

export type WelcomeJobRole = Exclude<OnboardingProfilePatchRequest["jobRole"], undefined>;
export type WelcomeCompanySize = Exclude<OnboardingProfilePatchRequest["companySize"], undefined>;
export type WelcomeHeardAboutUs = Exclude<OnboardingProfilePatchRequest["heardAboutUs"], undefined>;

export type WelcomeOnboardingStepId =
  | "profile"
  | "workspace"
  | "team"
  | "teamType"
  | "heardAboutUs";
export type WelcomeOnboardingStep = WelcomeOnboardingStepId;
export type OnboardingFlowMode = "first-run" | "create-workspace" | "invitation";
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
  jobRole: WelcomeJobRole;
  companySize: WelcomeCompanySize;
  subscribedProductUpdates: boolean;
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
