import type { DeploymentMode } from "@/types/api";
import type { AppLocale } from "@/lib/i18n";

export type SetupWizardStep = 0 | 1 | 2;
export type SetupAccessMode = "local_only" | "token";
export type SetupWorkspaceTemplate = "blog" | "website" | "blank";

export type SetupAdminDraft = {
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  displayName: string;
};

export type SetupAdminDraftPartial = Partial<SetupAdminDraft>;

export type SetupSiteDraft = {
  templateKey: SetupWorkspaceTemplate;
  workspaceName: string;
  siteName: string;
  siteUrl: string;
  siteDescription?: string;
};

export type SetupDefaultsDraft = {
  timezone: string;
  locale: AppLocale;
  dateFormat: string;
};

export type SetupSiteDraftPartial = Partial<SetupSiteDraft>;
export type SetupDefaultsDraftPartial = Partial<SetupDefaultsDraft>;

export interface SetupWizardState {
  initialized: boolean | null;
  masterKeyReady: boolean | null;
  repairRequired: boolean | null;
  setupEnabled: boolean | null;
  access: SetupAccessMode | null;
  deploymentMode: DeploymentMode | null;
  setupToken: string;
  step: SetupWizardStep;
  admin: SetupAdminDraftPartial;
  site: SetupSiteDraftPartial;
  defaults: SetupDefaultsDraftPartial;

  setSystemStatus: (
    status: {
      initialized: boolean;
      masterKeyReady: boolean;
      repairRequired: boolean;
      setupEnabled: boolean;
      access: SetupAccessMode;
    } | null,
  ) => void;
  setDeploymentMode: (mode: DeploymentMode | null) => void;
  setStep: (step: SetupWizardStep) => void;
  setSetupToken: (token: string) => void;
  setAdmin: (admin: SetupAdminDraftPartial) => void;
  patchAdmin: (patch: SetupAdminDraftPartial) => void;
  setSite: (site: SetupSiteDraftPartial) => void;
  patchSite: (patch: SetupSiteDraftPartial) => void;
  setDefaults: (defaults: SetupDefaultsDraftPartial) => void;
  patchDefaults: (patch: SetupDefaultsDraftPartial) => void;
  resetWizard: () => void;
}
