import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";

type SidebarDefaultPreferenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function SidebarDefaultPreferenceDialog(props: SidebarDefaultPreferenceDialogProps) {
  const { t } = useTranslation("account");

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ME_PREF_SIDEBAR_DEFAULT_DIALOG_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("ME_PREF_SIDEBAR_DEFAULT_DIALOG_DESC")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("ME_PREF_SIDEBAR_DEFAULT_DIALOG_KEEP_COLLAPSED")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>
            {t("ME_PREF_SIDEBAR_DEFAULT_DIALOG_EXPAND")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
