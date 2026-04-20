import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { filterOfficialContentModels } from "@/pages/projects/content/content-type-presentation";

import { ContentBootstrapStepOnePanel } from "./components/step-one-panel";
import { useContentBootstrapController } from "./hooks/use-content-bootstrap-controller";

export function ContentBootstrapPage(props: { workspaceId: string }) {
  const { t } = useTranslation("content");
  const controller = useContentBootstrapController(props.workspaceId);
  const availableModels = filterOfficialContentModels(controller.availableModels);
  const showModelSetupAction =
    !controller.modelsLoading && !controller.modelsError && availableModels.length === 0;

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
            loading={!showModelSetupAction ? controller.createPending : false}
            disabled={
              showModelSetupAction ? controller.busy : !controller.canCreate || controller.busy
            }
            onClick={showModelSetupAction ? controller.navigateToModels : controller.createDraft}
          >
            {showModelSetupAction
              ? t("CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY_ACTION")
              : t("CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT")}
          </Button>
        </div>
      }
      className="h-full"
      contentClassName="min-h-0 flex flex-col"
      contentContainerClassName="mx-auto w-full max-w-4xl"
    >
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
    </DefaultPage>
  );
}
