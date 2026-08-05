import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { filterOfficialContentModels } from "@/pages/projects/content/content-type-presentation";
import { ContentBootstrapStepOnePanel } from "@/pages/projects/content/bootstrap/components/step-one-panel";
import { useContentBootstrapController } from "@/pages/projects/content/bootstrap/hooks/use-content-bootstrap-controller";

export function ContentLibraryCreateContentDialog(props: {
  open: boolean;
  projectId: string;
  readOnly?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const controller = useContentBootstrapController(props.projectId);
  const availableModels = React.useMemo(
    () => filterOfficialContentModels(controller.availableModels),
    [controller.availableModels],
  );
  const showModelSetupAction =
    !controller.modelsLoading && !controller.modelsError && availableModels.length === 0;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content:CONTENT_LIBRARY_CREATE_DIALOG_TITLE")}
      description={t("content:CONTENT_LIBRARY_CREATE_DIALOG_DESC")}
      contentClassName="sm:max-w-4xl"
      bodyClassName="px-0 py-0"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={controller.busy || props.readOnly}
            onClick={controller.navigateToModels}
          >
            {t("content:CONTENT_LIBRARY_ACTION_MANAGE_TYPES")}
          </Button>
          <Button
            type="button"
            loading={!showModelSetupAction ? controller.createPending : false}
            disabled={
              props.readOnly ||
              (showModelSetupAction ? controller.busy : !controller.canCreate || controller.busy)
            }
            onClick={() => {
              if (props.readOnly) return;
              if (showModelSetupAction) {
                controller.navigateToModels();
                return;
              }
              controller.createDraft();
            }}
          >
            {showModelSetupAction
              ? t("content:CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY_ACTION")
              : t("content:CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT")}
          </Button>
        </>
      }
    >
      <div className="px-6 py-5">
        <ContentBootstrapStepOnePanel
          availableModels={availableModels}
          busy={controller.busy}
          modelsError={controller.modelsError}
          modelsLoading={controller.modelsLoading}
          selectedModel={controller.selectedModel}
          selectedModelKey={controller.selectedModelKey}
          summary={controller.summary}
          slug={controller.slug}
          title={controller.title}
          visibility={controller.visibility}
          seo={controller.seo}
          onModelSelect={controller.selectModel}
          onSummaryChange={controller.setSummary}
          onSlugChange={controller.setSlug}
          onTitleChange={controller.setTitle}
          onVisibilityChange={controller.setVisibility}
          onSeoMetaTitleChange={controller.setSeoMetaTitle}
          onSeoMetaDescriptionChange={controller.setSeoMetaDescription}
        />
      </div>
    </SettingDialog>
  );
}
