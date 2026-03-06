import { create } from "zustand";

export type MeSettingsDialogTab = "profile" | "preferences" | "security" | "notifications";

type OpenMeSettingsDialogArgs = {
  tab?: MeSettingsDialogTab;
};

type MeSettingsDialogStore = {
  open: boolean;
  tab: MeSettingsDialogTab;
  openDialog: (args?: OpenMeSettingsDialogArgs) => void;
  closeDialog: () => void;
  setTab: (tab: MeSettingsDialogTab) => void;
};

const DEFAULT_TAB: MeSettingsDialogTab = "profile";

export const useMeSettingsDialogStore = create<MeSettingsDialogStore>((set) => ({
  open: false,
  tab: DEFAULT_TAB,
  openDialog: (args) =>
    set({
      open: true,
      tab: args?.tab ?? DEFAULT_TAB,
    }),
  closeDialog: () => set({ open: false, tab: DEFAULT_TAB }),
  setTab: (tab) => set({ tab }),
}));
