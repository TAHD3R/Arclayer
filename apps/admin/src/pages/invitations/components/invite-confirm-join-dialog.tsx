import { Button } from "antd";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@celestial/ui/dialog";

type InviteConfirmJoinDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  email: string;
  targetName: string;
  roleName: string;
  roleDescription: string | null;
};

export function InviteConfirmJoinDialog({
  open,
  onOpenChange,
  onConfirm,
  email,
  targetName,
  roleName,
  roleDescription,
}: InviteConfirmJoinDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-title2">{t("invite:INVITE_CONFIRM_JOIN_TITLE")}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-label-secondary">
              <p>
                {t("invite:INVITE_CONFIRM_JOIN_LINE1", {
                  email,
                  workspaceName: targetName,
                })}
              </p>
              <p className="mt-2">
                {t("invite:INVITE_CONFIRM_JOIN_LINE2", { roleName })}
                {roleDescription ? (
                  <span className="text-label-secondary/70">
                    {" — "}
                    {roleDescription}
                  </span>
                ) : null}
              </p>
              <p className="mt-3 text-label-secondary/70">
                {t("invite:INVITE_CONFIRM_JOIN_RISK_NOTICE")}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="text" onClick={() => onOpenChange(false)}>
            {t("invite:INVITE_CONFIRM_JOIN_CANCEL")}
          </Button>
          <Button type="primary" onClick={onConfirm}>
            {t("invite:INVITE_CONFIRM_JOIN_OK")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
