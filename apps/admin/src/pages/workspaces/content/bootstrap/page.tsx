import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import { DefaultPage } from "@/layouts/page-shell/default-page";

import { ContentBootstrapStepOnePanel } from "./components/step-one-panel";
import { useContentBootstrapController } from "./hooks/use-content-bootstrap-controller";

export function ContentBootstrapPage(props: { workspaceId: string }) {
  const { t } = useTranslation("content");
  const controller = useContentBootstrapController(props.workspaceId);

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
            loading={controller.continuePending}
            disabled={!controller.canContinue || controller.busy}
            onClick={controller.continueWithStarter}
          >
            {t("CONTENT_BOOTSTRAP_ACTION_CONTINUE")}
          </Button>
        </div>
      }
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      contentContainerClassName="mx-auto w-full max-w-4xl"
    >
      <ContentBootstrapStepOnePanel
        busy={controller.busy}
        title={controller.title}
        selectedPresetKey={controller.selectedPresetKey}
        onTitleChange={controller.setTitle}
        onPresetSelect={controller.selectPreset}
      />
    </DefaultPage>
  );
}
