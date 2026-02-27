import { create } from "zustand";

import type {
  SetupAdminDraftPartial,
  SetupDefaultsDraftPartial,
  SetupSiteDraftPartial,
  SetupWizardState,
  SetupWizardStep,
} from "@/types/stores";

// In-memory only: contains sensitive fields (e.g. password), never persisted.
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

  setStep: (step: SetupWizardStep) => set({ step }),
  setSetupToken: (token) => set({ setupToken: token }),
  setAdmin: (admin: SetupAdminDraftPartial) => set({ admin }),
  patchAdmin: (patch) => set({ admin: { ...get().admin, ...patch } }),
  setSite: (site: SetupSiteDraftPartial) => set({ site }),
  patchSite: (patch) => set({ site: { ...get().site, ...patch } }),
  setDefaults: (defaults: SetupDefaultsDraftPartial) => set({ defaults }),
  patchDefaults: (patch) => set({ defaults: { ...get().defaults, ...patch } }),
  resetWizard: () => set({ step: 0, setupToken: "", admin: {}, site: {}, defaults: {} }),
}));
