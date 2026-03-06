import { MeSettingsDialog } from "@/pages/me/dialog/me-settings-dialog";
import { useMeSettingsDialogStore } from "@/stores/use-me-settings-dialog-store";

export function MeSettingsDialogHost() {
  const open = useMeSettingsDialogStore((s) => s.open);
  const tab = useMeSettingsDialogStore((s) => s.tab);
  const setTab = useMeSettingsDialogStore((s) => s.setTab);
  const closeDialog = useMeSettingsDialogStore((s) => s.closeDialog);

  return (
    <MeSettingsDialog
      open={open}
      tab={tab}
      onTabChange={setTab}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog();
      }}
    />
  );
}
