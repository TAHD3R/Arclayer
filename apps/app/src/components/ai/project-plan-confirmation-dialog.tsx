import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";

interface ProjectPlanConfirmationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onExecute: () => Promise<void> | void;
}

export function ProjectPlanConfirmationDialog(props: ProjectPlanConfirmationDialogProps) {
  const { t } = useTranslation(["ai"]);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const execute = async () => {
    setSubmitting(true);
    setFailed(false);
    try {
      await props.onExecute();
      props.onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        closeButtonLabel={t("ai:AI_PLAN_CONFIRM_CLOSE")}
        showCloseButton={!submitting}
      >
        <DialogHeader>
          <DialogTitle>{t("ai:AI_PLAN_CONFIRM_TITLE")}</DialogTitle>
          <DialogDescription>{t("ai:AI_PLAN_CONFIRM_DESCRIPTION")}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {t("ai:AI_PLAN_CONFIRM_FAILED")}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => props.onOpenChange(false)}
          >
            {t("ai:AI_PLAN_CONFIRM_CANCEL")}
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void execute()}>
            {submitting ? t("ai:AI_PLAN_CONFIRM_EXECUTING") : t("ai:AI_PLAN_CONFIRM_EXECUTE")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
