import {
  Blocks,
  Bot,
  ChevronDown,
  CircleAlert,
  FileCode2,
  Github,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import {
  AI_COMPOSER_SKILL_CREATOR_COMMAND,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";
import { useEnabledAIComposerSkills } from "@/components/ai/ai-composer-skill-menu";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import type { WorkspaceSkillCreateAction } from "./page";
import { useWorkspaceSkillsController } from "./use-workspace-skills-controller";
import {
  WorkspaceSkillPackageCreateDialog,
  WorkspaceSkillVersionCreateDialog,
} from "./workspace-skill-authoring-dialog";
import { WorkspaceSkillCatalogView } from "./workspace-skill-catalog-view";
import { WorkspaceSkillDetail } from "./workspace-skill-detail";
import { WorkspaceSkillGitHubImportDialog } from "./workspace-skill-github-dialog";
import { WorkspaceSkillGitHubStatus } from "./workspace-skill-github-status";
import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";
import { WorkspaceSkillZipImportDialog } from "./workspace-skill-zip-dialog";
import { WorkspaceOfficialSkillsCatalog } from "./workspace-official-skills-catalog";

export function WorkspaceSkillsView({
  workspaceId,
  requestedAction,
  focusRequestId,
}: {
  workspaceId: string;
  requestedAction?: WorkspaceSkillCreateAction;
  focusRequestId?: number;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const controller = useWorkspaceSkillsController(workspaceId);
  const creatorSkillsQuery = useEnabledAIComposerSkills({ workspaceId });
  const skillCreator = creatorSkillsQuery.skills.find(
    (skill) => skill.command === AI_COMPOSER_SKILL_CREATOR_COMMAND,
  );
  const {
    capabilitiesQuery,
    packagesQuery,
    installationsQuery,
    packageQuery,
    versionQuery,
    packages,
    installations,
    selectedPackage,
    validation,
    search,
    setSearch,
    setSelectedPackageId,
    dialog,
    setDialog,
    createPackageMutation,
    createVersionMutation,
    githubImportMutation,
    zipImportMutation,
    githubImportQuery,
    githubOperation,
    installMutation,
  } = controller;

  useEffect(() => {
    if (requestedAction === "manual") setDialog("manual");
    if (requestedAction === "github") setDialog("github");
    if (requestedAction === "zip") setDialog("zip");
  }, [focusRequestId, requestedAction, setDialog]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-10 pb-8">
      {capabilitiesQuery.isError ? (
        <AuthorityError onRetry={() => void capabilitiesQuery.refetch()} />
      ) : null}

      <section aria-labelledby="workspace-skills-section-title" className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="workspace-skills-section-title"
              className="text-title3 font-semibold text-label-primary"
            >
              {t("settings:SETTINGS_WORKSPACE_SKILLS_TAB_WORKSPACE")}
            </h2>
            <p className="max-w-3xl text-footnote leading-6 text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_TAB_WORKSPACE_DESC")}
            </p>
          </div>
          <WorkspaceSkillCreateMenu
            buildDisabled={creatorSkillsQuery.isLoading || !skillCreator}
            onBuild={() => {
              if (!skillCreator) throw new Error("AI_COMPOSER_SKILL_CREATOR_UNAVAILABLE");
              const directive = {
                type: "skill" as const,
                id: skillCreator.id,
                label: skillCreator.label,
                command: AI_COMPOSER_SKILL_CREATOR_COMMAND,
              };
              useAIComposerDirectiveStore.getState().addDirectives("home", [directive]);
              void navigate({
                to: "/",
                search: {
                  prompt: `${unstable_defaultDirectiveFormatter.serialize(directive)} `,
                } as never,
              });
            }}
            onSelect={setDialog}
          />
        </header>

        <PageExtraToolbar
          leading={
            <div className="relative w-full sm:max-w-sm">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
              />
              <Input
                aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_LABEL")}
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_PLACEHOLDER")}
                value={search}
              />
            </div>
          }
          trailing={null}
        />

        <WorkspaceSkillGitHubStatus
          accepted={githubOperation ?? undefined}
          error={githubImportQuery.isError}
          loading={githubImportQuery.isFetching}
          onRetry={() => void githubImportQuery.refetch()}
          operation={githubImportQuery.data}
        />
        <ContentGuard
          error={packagesQuery.error ?? installationsQuery.error}
          loading={packagesQuery.isLoading || installationsQuery.isLoading}
          loadingVariant="split-detail"
          onRetry={() => {
            void packagesQuery.refetch();
            void installationsQuery.refetch();
          }}
        >
          {!packages.length ? (
            <WorkspaceSkillsEmptyState />
          ) : (
            <div className="space-y-5">
              <WorkspaceSkillCatalogView
                installations={installations}
                onSelect={setSelectedPackageId}
                packages={packages}
                selectedId={selectedPackage?.id}
              />
              {selectedPackage ? <WorkspaceSkillDetail controller={controller} /> : null}
            </div>
          )}
        </ContentGuard>
      </section>

      <section aria-labelledby="official-skills-section-title" className="space-y-5">
        <header className="space-y-1">
          <h2
            id="official-skills-section-title"
            className="text-title3 font-semibold text-label-primary"
          >
            {t("settings:SETTINGS_WORKSPACE_SKILLS_TAB_OFFICIAL")}
          </h2>
          <p className="max-w-3xl text-footnote leading-6 text-label-secondary">
            {t("settings:SETTINGS_WORKSPACE_SKILLS_TAB_OFFICIAL_DESC")}
          </p>
        </header>
        <WorkspaceOfficialSkillsCatalog workspaceId={workspaceId} />
      </section>

      <WorkspaceSkillPackageCreateDialog
        onOpenChange={(open) => setDialog(open ? "manual" : null)}
        onSubmit={(payload) => createPackageMutation.mutateAsync(payload).then(() => undefined)}
        open={dialog === "manual"}
        pending={createPackageMutation.isPending}
      />
      <WorkspaceSkillGitHubImportDialog
        onOpenChange={(open) => setDialog(open ? "github" : null)}
        onSubmit={(payload) => githubImportMutation.mutateAsync(payload).then(() => undefined)}
        open={dialog === "github"}
        pending={githubImportMutation.isPending}
      />
      <WorkspaceSkillZipImportDialog
        onOpenChange={(open) => setDialog(open ? "zip" : null)}
        onSubmit={(file) => zipImportMutation.mutateAsync(file).then(() => undefined)}
        open={dialog === "zip"}
        pending={zipImportMutation.isPending}
      />
      <WorkspaceSkillVersionCreateDialog
        onOpenChange={(open) => setDialog(open ? "version" : null)}
        onSubmit={(payload) => createVersionMutation.mutateAsync(payload).then(() => undefined)}
        open={dialog === "version"}
        package={packageQuery.data}
        pending={createVersionMutation.isPending}
        sourceVersion={versionQuery.data}
      />
      {versionQuery.data && validation ? (
        <WorkspaceSkillInstallDialog
          onOpenChange={(open) => setDialog(open ? "install" : null)}
          onSubmit={(payload) => installMutation.mutateAsync(payload).then(() => undefined)}
          open={dialog === "install"}
          packageScope="workspace"
          pending={installMutation.isPending}
          validation={validation}
          version={versionQuery.data}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSkillCreateMenu({
  buildDisabled,
  onBuild,
  onSelect,
}: Readonly<{
  buildDisabled: boolean;
  onBuild: () => void;
  onSelect: (action: WorkspaceSkillCreateAction) => void;
}>) {
  const { t } = useTranslation("settings");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          {t("SETTINGS_WORKSPACE_SKILLS_ADD_ACTION")}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <SkillCreateMenuItem
          icon={<Bot className="size-4" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_BUILD_WITH_ARCLAYER")}
          disabled={buildDisabled}
          onSelect={onBuild}
        />
        <SkillCreateMenuItem
          icon={<FileCode2 className="size-4" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_WRITE_MANUALLY")}
          onSelect={() => onSelect("manual")}
        />
        <SkillCreateMenuItem
          icon={<Github className="size-4" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB")}
          onSelect={() => onSelect("github")}
        />
        <SkillCreateMenuItem
          icon={<Upload className="size-4" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_UPLOAD_ZIP")}
          onSelect={() => onSelect("zip")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkillCreateMenuItem(props: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem className="gap-2" disabled={props.disabled} onSelect={props.onSelect}>
      <span className="text-label-secondary">{props.icon}</span>
      <span>{props.label}</span>
    </DropdownMenuItem>
  );
}

function AuthorityError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_AUTHORITY_TITLE")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2" aria-live="polite">
        <span>{t("settings:SETTINGS_WORKSPACE_SKILLS_AUTHORITY_ERROR")}</span>
        <Button className="self-start" onClick={onRetry} size="sm" variant="outline">
          {t("common:RETRY")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function WorkspaceSkillsEmptyState() {
  const { t } = useTranslation("settings");
  return (
    <Empty className="min-h-72 border border-dashed bg-transparent">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Blocks aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("SETTINGS_WORKSPACE_SKILLS_EMPTY_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("SETTINGS_WORKSPACE_SKILLS_EMPTY_DESC")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
