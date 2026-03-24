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
        <Button
          type="button"
          variant="ghost"
          disabled={controller.busy}
          onClick={controller.navigateToLibrary}
        >
          {t("CONTENT_BOOTSTRAP_ACTION_SKIP")}
        </Button>
      }
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      contentContainerClassName="mx-auto w-full max-w-4xl"
    >
      <ContentBootstrapStepOnePanel
        busy={controller.busy}
        title={controller.title}
        selectedPresetKey={controller.selectedPresetKey}
        canContinue={controller.canContinue}
        continuePending={controller.continuePending}
        onTitleChange={controller.setTitle}
        onPresetSelect={controller.selectPreset}
        onContinue={controller.continueWithStarter}
      />
    </DefaultPage>
  );
}
