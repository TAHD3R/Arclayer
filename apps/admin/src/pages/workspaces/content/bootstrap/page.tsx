import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ContentBootstrapStepOnePanel } from "./components/step-one-panel";
import { useContentBootstrapController } from "./hooks/use-content-bootstrap-controller";

export function ContentBootstrapPage(props: { workspaceId: string }) {
  const { t } = useTranslation("content");
  const controller = useContentBootstrapController(props.workspaceId);
  const showModelSetupAction =
    !controller.modelsLoading && !controller.modelsError && !controller.hasAvailableModels;

  return (
    <DefaultPage
      title={t("CONTENT_BOOTSTRAP_CREATE_TITLE")}
      description={t("CONTENT_BOOTSTRAP_CREATE_DESC")}
      showFavoriteToggle={false}
      action={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={controller.busy}
            onClick={controller.navigateToLibrary}
          >
            {t("CONTENT_BOOTSTRAP_ACTION_SKIP")}
          </Button>
          <Button
            type="button"
            loading={!showModelSetupAction ? controller.continuePending : false}
            disabled={
              showModelSetupAction ? controller.busy : !controller.canContinue || controller.busy
            }
            onClick={
              showModelSetupAction ? controller.navigateToModels : controller.continueWithStarter
            }
          >
            {showModelSetupAction
              ? t("CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY_ACTION")
              : t("CONTENT_BOOTSTRAP_ACTION_CONTINUE")}
          </Button>
        </div>
      }
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      contentContainerClassName="mx-auto w-full max-w-4xl"
    >
      <ContentBootstrapStepOnePanel
        availableModels={controller.availableModels}
        busy={controller.busy}
        modelsError={controller.modelsError}
        modelsLoading={controller.modelsLoading}
        selectedModelKey={controller.selectedModelKey}
        title={controller.title}
        selectedPresetKey={controller.selectedPresetKey}
        onModelSelect={controller.selectModel}
        onTitleChange={controller.setTitle}
        onPresetSelect={controller.selectPreset}
      />
    </DefaultPage>
  );
}
