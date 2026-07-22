import { Blocks, CircleAlert, Github, Plus, Search, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";

import { useWorkspaceSkillsController } from "./use-workspace-skills-controller";
import {
  WorkspaceSkillPackageCreateDialog,
  WorkspaceSkillVersionCreateDialog,
} from "./workspace-skill-authoring-dialog";
import { WorkspaceSkillDetail } from "./workspace-skill-detail";
import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";
import { WorkspaceSkillGitHubImportDialog } from "./workspace-skill-github-dialog";
import { WorkspaceSkillGitHubStatus } from "./workspace-skill-github-status";
import { WorkspaceOfficialSkillsCatalog } from "./workspace-official-skills-catalog";
import { WorkspaceSkillPackageList } from "./workspace-skills-components";
import { WorkspaceSkillsCapabilityBoundaries } from "./workspace-skills-boundaries";

export function WorkspaceSkillsView({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const controller = useWorkspaceSkillsController(workspaceId);
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
    githubImportQuery,
    githubOperation,
    installMutation,
  } = controller;
  const capabilityMessage = capabilitiesQuery.isPending
    ? "SETTINGS_WORKSPACE_SKILLS_AUTHORITY_LOADING"
    : capabilitiesQuery.isError
      ? "SETTINGS_WORKSPACE_SKILLS_AUTHORITY_ERROR"
      : "SETTINGS_WORKSPACE_SKILLS_AUTHORITY_READY";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      <Alert variant={capabilitiesQuery.isError ? "destructive" : "default"}>
        {capabilitiesQuery.isError ? (
          <CircleAlert aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_AUTHORITY_TITLE")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2" aria-live="polite">
          <span>{t(`settings:${capabilityMessage}`)}</span>
          {capabilitiesQuery.isError ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void capabilitiesQuery.refetch()}
            >
              {t("common:RETRY")}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_LABEL")}
            placeholder={t("settings:SETTINGS_WORKSPACE_SKILLS_SEARCH_PLACEHOLDER")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!capabilitiesQuery.data?.githubImportAvailable}
            onClick={() => setDialog("github")}
          >
            <Github data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_ACTION")}
          </Button>
          <Button onClick={() => setDialog("package")}>
            <Plus data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_CREATE_ACTION")}
          </Button>
        </div>
      </div>

      <WorkspaceSkillGitHubStatus
        accepted={githubOperation ?? undefined}
        operation={githubImportQuery.data}
        loading={githubImportQuery.isFetching}
        error={githubImportQuery.isError}
        onRetry={() => void githubImportQuery.refetch()}
      />

      <WorkspaceOfficialSkillsCatalog workspaceId={workspaceId} search={search} />

      <div>
        <h2 className="text-headline text-label-primary">
          {t("settings:SETTINGS_WORKSPACE_SKILLS_CUSTOM_TITLE")}
        </h2>
        <p className="mt-1 text-footnote text-label-secondary">
          {t("settings:SETTINGS_WORKSPACE_SKILLS_CUSTOM_DESC")}
        </p>
      </div>

      <ContentGuard
        loading={packagesQuery.isLoading || installationsQuery.isLoading}
        error={packagesQuery.error ?? installationsQuery.error}
        onRetry={() => {
          void packagesQuery.refetch();
          void installationsQuery.refetch();
        }}
        loadingVariant="form"
      >
        {!packages.length ? (
          <WorkspaceSkillsEmptyState onCreate={() => setDialog("package")} />
        ) : selectedPackage ? (
          <div className="grid min-h-[42rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[19rem_minmax(0,1fr)]">
            <aside
              className="border-b bg-muted/30 lg:border-b-0 lg:border-r"
              aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_PACKAGE_LIST_LABEL")}
            >
              <WorkspaceSkillPackageList
                packages={packages}
                installations={installations}
                selectedId={selectedPackage.id}
                onSelect={setSelectedPackageId}
              />
            </aside>
            <WorkspaceSkillDetail controller={controller} />
          </div>
        ) : null}
      </ContentGuard>

      {capabilitiesQuery.data ? (
        <WorkspaceSkillsCapabilityBoundaries capabilities={capabilitiesQuery.data} />
      ) : null}

      <WorkspaceSkillPackageCreateDialog
        open={dialog === "package"}
        onOpenChange={(open) => setDialog(open ? "package" : null)}
        pending={createPackageMutation.isPending}
        onSubmit={(payload) => createPackageMutation.mutateAsync(payload).then(() => undefined)}
      />
      <WorkspaceSkillGitHubImportDialog
        open={dialog === "github"}
        onOpenChange={(open) => setDialog(open ? "github" : null)}
        pending={githubImportMutation.isPending}
        onSubmit={(payload) => githubImportMutation.mutateAsync(payload).then(() => undefined)}
      />
      <WorkspaceSkillVersionCreateDialog
        open={dialog === "version"}
        onOpenChange={(open) => setDialog(open ? "version" : null)}
        pending={createVersionMutation.isPending}
        package={packageQuery.data}
        sourceVersion={versionQuery.data}
        onSubmit={(payload) => createVersionMutation.mutateAsync(payload).then(() => undefined)}
      />
      {versionQuery.data && validation ? (
        <WorkspaceSkillInstallDialog
          open={dialog === "install"}
          onOpenChange={(open) => setDialog(open ? "install" : null)}
          pending={installMutation.isPending}
          packageScope="workspace"
          version={versionQuery.data}
          validation={validation}
          onSubmit={(payload) => installMutation.mutateAsync(payload).then(() => undefined)}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSkillsEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation("settings");
  return (
    <Empty className="min-h-96 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Blocks aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("SETTINGS_WORKSPACE_SKILLS_EMPTY_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("SETTINGS_WORKSPACE_SKILLS_EMPTY_DESC")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate}>
          <Plus data-icon="inline-start" />
          {t("SETTINGS_WORKSPACE_SKILLS_CREATE_ACTION")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
