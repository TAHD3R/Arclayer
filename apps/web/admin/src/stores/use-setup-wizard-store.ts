import { create } from "zustand";

import type { DeploymentMode } from "@/api/system";
import { type AppLocale } from "@/lib/i18n";

/**
 * Setup wizard state is intentionally in-memory only:
 * - Contains sensitive fields (e.g. password)
 * - Should never be persisted to localStorage
 */

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

interface SetupWizardState {
  // System setup status (source-of-truth for route guard / access hints).
  initialized: boolean | null;
  setupEnabled: boolean | null;
  access: SetupAccessMode | null;
  deploymentMode: DeploymentMode | null;

  // Security inputs for setup access (in-memory only).
  setupToken: string;

  step: SetupWizardStep;
  admin: SetupAdminDraftPartial;
  site: SetupSiteDraftPartial;
  defaults: SetupDefaultsDraftPartial;

  setSystemStatus: (
    status: {
      initialized: boolean;
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

  /** Reset draft only (keep system status intact). */
  resetWizard: () => void;
}

export const useSetupWizardStore = create<SetupWizardState>((set, get) => ({
  initialized: null,
  setupEnabled: null,
  access: null,
  deploymentMode: null,

  setupToken: "",

  step: 0,
  admin: {},
  site: {},
  defaults: {},

  setSystemStatus: (status) => {
    if (!status) {
      set({ initialized: null, setupEnabled: null, access: null });
      return;
    }
    set({
      initialized: status.initialized,
      setupEnabled: status.setupEnabled,
      access: status.access,
    });
  },
  setDeploymentMode: (mode) => set({ deploymentMode: mode }),

  setStep: (step) => set({ step }),
  setSetupToken: (token) => set({ setupToken: token }),
  setAdmin: (admin) => set({ admin }),
  patchAdmin: (patch) => {
    const current = get().admin;
    set({ admin: { ...current, ...patch } });
  },
  setSite: (site) => set({ site }),
  patchSite: (patch) => {
    const current = get().site;
    set({ site: { ...current, ...patch } });
  },
  setDefaults: (defaults) => set({ defaults }),
  patchDefaults: (patch) => {
    const current = get().defaults;
    set({ defaults: { ...current, ...patch } });
  },
  resetWizard: () => set({ step: 0, setupToken: "", admin: {}, site: {}, defaults: {} }),
}));
