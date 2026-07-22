import { CircleAlert, GitBranch, Palette, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BuilderRevisionOut, ComponentCatalogV1 } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getErrorMessage } from "@/lib/notifications";
import { StyleGuideEvidenceTrack } from "@/pages/projects/editor/style-guide-evidence-track";
import { StyleGuideAgentConcepts } from "@/pages/projects/editor/style-guide-agent-concepts";
import { StyleGuideFoundationPreview } from "@/pages/projects/editor/style-guide-foundation-preview";
import { StyleGuideForkDialog } from "@/pages/projects/editor/style-guide-fork-dialog";
import type { ProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";
import { WorkspaceDesignSystemVersionDialog } from "@/pages/workspaces/settings/workspace/design-systems/workspace-design-system-dialogs";

interface StyleGuideStageProps {
  projectName: string;
  revision: BuilderRevisionOut;
  componentCatalog: ComponentCatalogV1 | null;
  controller: ProjectStyleGuideController;
}

export function StyleGuideStage(props: StyleGuideStageProps) {
  const { t } = useTranslation("account");
  const { controller } = props;
  const queryError = controller.assignmentQuery.error ?? controller.sourceVersionQuery.error;
  const commandError =
    controller.forkMutation.error ??
    controller.createVersionMutation.error ??
    controller.validateMutation.error ??
    controller.assignMutation.error ??
    controller.previewRefreshMutation.error ??
    controller.applyRefreshMutation.error;
  const displayedVersion = controller.candidateVersion ?? controller.sourceVersion;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-muted/25 xl:flex-row"
      role="region"
      aria-label={t("CREATION_EDITOR_STYLE_GUIDE_LABEL")}
    >
      <ContentGuard
        loading={controller.assignmentQuery.isPending || controller.sourceVersionQuery.isPending}
        error={queryError}
        onRetry={() => {
          void controller.assignmentQuery.refetch();
          void controller.sourceVersionQuery.refetch();
        }}
        loadingVariant="form"
      >
        {!controller.assignment || !controller.sourceVersion ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8">
            <Alert variant="destructive" className="max-w-xl">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>{t("CREATION_EDITOR_STYLE_ASSIGNMENT_MISSING_TITLE")}</AlertTitle>
              <AlertDescription>
                {t("CREATION_EDITOR_STYLE_ASSIGNMENT_MISSING_DESC")}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <>
            <ScrollArea className="min-w-0 flex-1">
              <div className="mx-auto max-w-6xl px-6 py-7 lg:px-9 lg:py-9">
                <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 text-footnote text-label-secondary">
                      <Palette className="size-4" aria-hidden="true" />
                      <span>{t("CREATION_EDITOR_STYLE_FOUNDATION_LABEL")}</span>
                    </div>
                    <h1 className="mt-2 text-title1 font-semibold tracking-tight text-label-primary">
                      {displayedVersion?.manifest.name}
                    </h1>
                    <p className="mt-2 text-body text-label-secondary">
                      {t("CREATION_EDITOR_STYLE_FOUNDATION_DESC")}
                    </p>
                  </div>
                  <HeaderAction controller={controller} />
                </header>

                {!controller.online ? (
                  <Alert className="mt-5" variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>{t("CREATION_EDITOR_STYLE_OFFLINE_TITLE")}</AlertTitle>
                    <AlertDescription>{t("CREATION_EDITOR_STYLE_OFFLINE_DESC")}</AlertDescription>
                  </Alert>
                ) : null}
                {!controller.canWrite ? (
                  <Alert className="mt-5">
                    <ShieldCheck aria-hidden="true" />
                    <AlertTitle>{t("CREATION_EDITOR_STYLE_READ_ONLY_TITLE")}</AlertTitle>
                    <AlertDescription>{t("CREATION_EDITOR_STYLE_READ_ONLY_DESC")}</AlertDescription>
                  </Alert>
                ) : null}
                {commandError ? (
                  <Alert className="mt-5" variant="destructive" role="alert">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>{t("CREATION_EDITOR_STYLE_COMMAND_ERROR_TITLE")}</AlertTitle>
                    <AlertDescription>{getErrorMessage(commandError)}</AlertDescription>
                  </Alert>
                ) : null}

                <StyleGuideAgentConcepts controller={controller} />

                <StyleGuideFoundationPreview
                  manifest={displayedVersion!.manifest}
                  candidate={Boolean(controller.candidateVersion)}
                />
              </div>
            </ScrollArea>
            <StyleGuideEvidenceTrack revision={props.revision} controller={controller} />
          </>
        )}
      </ContentGuard>

      <StyleGuideForkDialog
        open={controller.forkDialogOpen}
        projectName={props.projectName}
        pending={controller.forkMutation.isPending}
        error={
          controller.forkMutation.error ? getErrorMessage(controller.forkMutation.error) : null
        }
        onOpenChange={controller.setForkDialogOpen}
        onSubmit={(values) => controller.forkMutation.mutate(values)}
      />
      <WorkspaceDesignSystemVersionDialog
        open={controller.versionDialogOpen}
        onOpenChange={controller.setVersionDialogOpen}
        source={controller.sourceVersion?.manifest}
        parentVersionId={controller.sourceVersion?.id}
        parentChecksum={controller.sourceVersion?.manifestChecksum}
        componentCatalogs={props.componentCatalog ? [props.componentCatalog] : []}
        componentCatalogsPending={false}
        componentCatalogsError={
          props.componentCatalog ? null : new Error("COMPONENT_CATALOG_REQUIRED")
        }
        pending={controller.createVersionMutation.isPending}
        error={controller.createVersionMutation.error}
        onSubmit={(payload) => controller.createVersionMutation.mutate(payload)}
      />
    </section>
  );
}

function HeaderAction({ controller }: { controller: ProjectStyleGuideController }) {
  const { t } = useTranslation("account");
  const disabled = !controller.canWrite || !controller.online;
  if (controller.assignment?.ownerKind !== "project") {
    return (
      <Button
        className="min-h-11 xl:min-h-9"
        disabled={disabled}
        onClick={() => controller.setForkDialogOpen(true)}
      >
        <GitBranch data-icon="inline-start" />
        {t("CREATION_EDITOR_STYLE_FORK_ACTION")}
      </Button>
    );
  }
  if (!controller.candidateVersion) {
    return (
      <Button
        className="min-h-11 xl:min-h-9"
        variant="outline"
        disabled={disabled}
        onClick={() => controller.setVersionDialogOpen(true)}
      >
        {t("CREATION_EDITOR_STYLE_CREATE_MANUAL_VERSION")}
      </Button>
    );
  }
  return (
    <Button
      className="min-h-11 xl:min-h-9"
      variant="outline"
      disabled={controller.createVersionMutation.isPending}
      onClick={controller.discardCandidate}
    >
      {t("CREATION_EDITOR_STYLE_DISCARD_CANDIDATE")}
    </Button>
  );
}
