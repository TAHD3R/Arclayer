import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import type { InstanceRepairRequiredPaneProps } from "../types";
import { AUTH_PANE_STACK_CLASS, AuthPaneHeader, AuthPaneLegal } from "./auth-pane-primitives";

export function InstanceRepairRequiredPane(props: InstanceRepairRequiredPaneProps) {
  const { t } = useTranslation();

  return (
    <div className={AUTH_PANE_STACK_CLASS}>
      <AuthPaneHeader
        titleKey="auth:INSTANCE_REPAIR_REQUIRED_TITLE"
        subtitleKey="auth:INSTANCE_REPAIR_REQUIRED_SUBTITLE"
        variants={{}}
      />
      {props.repairReason ? (
        <div className="rounded-2xl border border-border/80 bg-card/60 px-4 py-3">
          <div className="text-caption text-label-secondary">
            {t("auth:INSTANCE_REPAIR_REQUIRED_REASON")}
          </div>
          <div className="pt-1 font-mono text-footnote text-label-primary">
            {props.repairReason}
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 pt-1">
        <Button className="w-full" type="button" size="lg" onClick={props.onRefresh}>
          {t("auth:INSTANCE_REPAIR_REQUIRED_REFRESH")}
        </Button>
      </div>
      <AuthPaneLegal i18nKey="auth:LEGAL_CONTINUE" variants={{}} />
    </div>
  );
}
