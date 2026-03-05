import { create } from "zustand";

type OpenWorkspaceSwitchDialogArgs = {
  organizationId: string;
  autoOpenCreate?: boolean;
};

type WorkspaceSwitchDialogStore = {
  open: boolean;
  organizationId: string | null;
  autoOpenCreate: boolean;
  openDialog: (args: OpenWorkspaceSwitchDialogArgs) => void;
  closeDialog: () => void;
  consumeAutoOpenCreate: () => void;
};

export const useWorkspaceSwitchDialogStore = create<WorkspaceSwitchDialogStore>((set) => ({
  open: false,
  organizationId: null,
  autoOpenCreate: false,
  openDialog: (args) =>
    set({
      open: true,
      organizationId: args.organizationId,
      autoOpenCreate: Boolean(args.autoOpenCreate),
    }),
  closeDialog: () => set({ open: false, organizationId: null, autoOpenCreate: false }),
  consumeAutoOpenCreate: () => set({ autoOpenCreate: false }),
}));
