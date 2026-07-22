import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { getErrorMessage } from "@/lib/notifications";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";

export function StyleGuideVersionSupersessionDialog({
  controller,
}: {
  controller: ProjectStyleGuideController;
}) {
  const { t } = useTranslation("account");
  const supersession = controller.supersession;
  const target = supersession.targetVersion;
  const replacement = supersession.replacementVersion;
  const isOpen = Boolean(target && replacement);

  return (
    <SettingDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) supersession.close();
      }}
      title={t("CREATION_EDITOR_STYLE_SUPERSEDE_TITLE", {
        version: target?.versionNumber ?? "",
      })}
      description={t("CREATION_EDITOR_STYLE_SUPERSEDE_DESC", {
        target: target?.versionNumber ?? "",
        replacement: replacement?.versionNumber ?? "",
      })}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={supersession.mutation.isPending}
            onClick={supersession.close}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            loading={supersession.mutation.isPending}
            onClick={supersession.confirm}
          >
            {t("CREATION_EDITOR_STYLE_SUPERSEDE_CONFIRM")}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 py-2 text-footnote leading-5 text-label-secondary">
        <p>{t("CREATION_EDITOR_STYLE_SUPERSEDE_NEW_ASSIGNMENTS")}</p>
        <p>{t("CREATION_EDITOR_STYLE_SUPERSEDE_HISTORY_PRESERVED")}</p>
        <p>{t("CREATION_EDITOR_STYLE_SUPERSEDE_CANVAS_UNCHANGED")}</p>
        {supersession.mutation.error ? (
          <p className="text-destructive" role="alert">
            {getErrorMessage(supersession.mutation.error)}
          </p>
        ) : null}
      </div>
    </SettingDialog>
  );
}
