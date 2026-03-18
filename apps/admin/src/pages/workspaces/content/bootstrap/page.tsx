import { useTranslation } from "react-i18next";

import { ContentBootstrapDraftSummaryCard } from "./components/draft-summary-card";
import { ContentBootstrapFooterActions } from "./components/footer-actions";
import { ContentBootstrapProgressRail } from "./components/progress-rail";
import { ContentBootstrapStepOnePanel } from "./components/step-one-panel";
import { ContentBootstrapStepTwoPanel } from "./components/step-two-panel";
import { ContentBootstrapShell } from "./content-bootstrap-shell";
import { useContentBootstrapController } from "./hooks/use-content-bootstrap-controller";

export function ContentBootstrapPage(props: { workspaceId: string }) {
  const { t } = useTranslation("content");
  const controller = useContentBootstrapController(props.workspaceId);

  return (
    <ContentBootstrapShell
      eyebrow={t("CONTENT_BOOTSTRAP_EYEBROW")}
      title={t("CONTENT_BOOTSTRAP_TITLE")}
      description={t("CONTENT_BOOTSTRAP_DESC")}
      sideTitle={t("CONTENT_BOOTSTRAP_SIDE_TITLE")}
      sideDescription={t("CONTENT_BOOTSTRAP_SIDE_DESC")}
      principles={[
        t("CONTENT_BOOTSTRAP_PRINCIPLE_ONE"),
        t("CONTENT_BOOTSTRAP_PRINCIPLE_TWO"),
        t("CONTENT_BOOTSTRAP_PRINCIPLE_THREE"),
      ]}
      progress={
        <ContentBootstrapProgressRail
          draftCreated={controller.draftCreated}
          presetState={controller.shapeSelection.presetState}
        />
      }
      footer={
        <ContentBootstrapFooterActions
          draftCreated={controller.draftCreated}
          busy={controller.busy}
          canCreate={controller.canCreateDraft}
          createPending={controller.createDraftPending}
          continuePending={controller.continuePending}
          hasPreset={controller.hasPresetSelection}
          onBack={controller.navigateToLibrary}
          onCreate={controller.createDraft}
          onLeave={controller.navigateToLibrary}
          onDetachPreset={controller.detachPreset}
          onContinue={controller.continueToEditor}
        />
      }
    >
      {!controller.draftCreated ? (
        <ContentBootstrapStepOnePanel
          busy={controller.busy}
          title={controller.title}
          locale={controller.locale}
          localeOptions={controller.localeOptions}
          onTitleChange={controller.setTitle}
          onLocaleChange={controller.setLocale}
        />
      ) : (
        <div className="space-y-6">
          {controller.draftItem ? (
            <ContentBootstrapDraftSummaryCard item={controller.draftItem} />
          ) : null}
          <ContentBootstrapStepTwoPanel
            selection={controller.shapeSelection}
            onPresetSelect={controller.selectPreset}
            onCapabilityPackToggle={controller.toggleCapabilityPack}
          />
        </div>
      )}
    </ContentBootstrapShell>
  );
}
