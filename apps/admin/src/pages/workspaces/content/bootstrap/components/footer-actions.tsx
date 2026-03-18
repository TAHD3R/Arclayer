import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

function StepOneFooter(props: {
  busy: boolean;
  canCreate: boolean;
  createPending: boolean;
  onBack: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation(["content", "common"]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-foreground">
          {t("CONTENT_BOOTSTRAP_STEP_ONE_TITLE")}
        </div>
        <div className="text-sm text-label-secondary">
          {t("CONTENT_BOOTSTRAP_STEP_ONE_SUPPORT")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("common:BACK")}
        </Button>
        <Button
          type="button"
          loading={props.createPending}
          disabled={!props.canCreate || props.busy}
          onClick={props.onCreate}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT")}
        </Button>
      </div>
    </div>
  );
}

function StepTwoFooter(props: {
  busy: boolean;
  continuePending: boolean;
  hasPreset: boolean;
  onLeave: () => void;
  onDetachPreset: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("content");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-foreground">
          {t("CONTENT_BOOTSTRAP_FOOTER_READY_TITLE")}
        </div>
        <div className="text-sm text-label-secondary">
          {t("CONTENT_BOOTSTRAP_FOOTER_READY_DESC")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" disabled={props.busy} onClick={props.onLeave}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("CONTENT_BOOTSTRAP_ACTION_LEAVE_FOR_LATER")}
        </Button>
        {props.hasPreset ? (
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={props.onDetachPreset}
          >
            {t("CONTENT_BOOTSTRAP_ACTION_DETACH_PRESET")}
          </Button>
        ) : null}
        <Button
          type="button"
          loading={props.continuePending}
          disabled={props.busy}
          onClick={props.onContinue}
        >
          {t("CONTENT_BOOTSTRAP_ACTION_CONTINUE_TO_EDITOR")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function ContentBootstrapFooterActions(props: {
  draftCreated: boolean;
  busy: boolean;
  canCreate: boolean;
  createPending: boolean;
  continuePending: boolean;
  hasPreset: boolean;
  onBack: () => void;
  onCreate: () => void;
  onLeave: () => void;
  onDetachPreset: () => void;
  onContinue: () => void;
}) {
  if (!props.draftCreated) {
    return (
      <StepOneFooter
        busy={props.busy}
        canCreate={props.canCreate}
        createPending={props.createPending}
        onBack={props.onBack}
        onCreate={props.onCreate}
      />
    );
  }

  return (
    <StepTwoFooter
      busy={props.busy}
      continuePending={props.continuePending}
      hasPreset={props.hasPreset}
      onLeave={props.onLeave}
      onDetachPreset={props.onDetachPreset}
      onContinue={props.onContinue}
    />
  );
}
