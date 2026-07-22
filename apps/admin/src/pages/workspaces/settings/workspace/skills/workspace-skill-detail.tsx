import {
  CircleAlert,
  Copy,
  FileCode2,
  Github,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import { Switch } from "@arclayer/ui/switch";

import type { WorkspaceSkillsController } from "./use-workspace-skills-controller";
import {
  SkillStatusBadge,
  WorkspaceSkillLifecycleRail,
  WorkspaceSkillVersionList,
} from "./workspace-skills-components";
import { WorkspaceSkillValidationFindings } from "./workspace-skills-boundaries";
import { WorkspaceSkillRemovalAction } from "./workspace-skill-removal-action";
import { WorkspaceSkillPackageArchiveAction } from "./workspace-skill-package-archive-action";
import { WorkspaceSkillUpdateAction } from "./workspace-skill-update-action";

export function WorkspaceSkillDetail({ controller }: { controller: WorkspaceSkillsController }) {
  const { t } = useTranslation("settings");
  const {
    workspaceId,
    packageQuery,
    versionsQuery,
    versionQuery,
    validationsQuery,
    selectedVersion,
    setSelectedVersionId,
    setDialog,
    versions,
    validation,
    installation,
    capabilitiesQuery,
    githubRefreshMutation,
    updateInstallationMutation,
  } = controller;
  const installable = validation && ["valid", "warning"].includes(validation.status);
  const installationMatchesVersion = installation?.versionId === versionQuery.data?.id;

  return (
    <ContentGuard
      loading={packageQuery.isLoading || versionsQuery.isLoading}
      error={packageQuery.error ?? versionsQuery.error}
      onRetry={() => {
        void packageQuery.refetch();
        void versionsQuery.refetch();
      }}
      loadingVariant="form"
    >
      {packageQuery.data && selectedVersion ? (
        <section className="min-w-0 p-4 sm:p-5" aria-labelledby="workspace-skill-detail-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="workspace-skill-detail-title"
                  className="text-title3 font-semibold text-label-primary"
                >
                  {packageQuery.data.displayName}
                </h2>
                <Badge variant="outline">{packageQuery.data.trustLevel}</Badge>
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {packageQuery.data.description}
              </p>
              <p className="mt-2 font-mono text-caption text-label-tertiary">
                {packageQuery.data.slug} · {packageQuery.data.publisherName}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {packageQuery.data.sourceKind === "github" ? (
                <Button
                  variant="outline"
                  loading={githubRefreshMutation.isPending}
                  disabled={
                    githubRefreshMutation.isPending ||
                    !capabilitiesQuery.data?.githubImportAvailable
                  }
                  onClick={() => githubRefreshMutation.mutate()}
                >
                  <RefreshCw data-icon="inline-start" />
                  {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_ACTION")}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setDialog("version")}>
                  <Plus data-icon="inline-start" />
                  {t("SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_ACTION")}
                </Button>
              )}
              <WorkspaceSkillPackageArchiveAction
                workspaceId={workspaceId}
                packageId={packageQuery.data.id}
                metadataRevision={packageQuery.data.metadataRevision}
              />
            </div>
          </div>

          <ContentGuard
            loading={versionQuery.isLoading || validationsQuery.isLoading}
            error={versionQuery.error ?? validationsQuery.error}
            onRetry={() => {
              void versionQuery.refetch();
              void validationsQuery.refetch();
            }}
            loadingVariant="form"
          >
            {versionQuery.data ? (
              <div className="mt-5 flex flex-col gap-6">
                {packageQuery.data.sourceKind === "github" ? (
                  <GitHubSourceEvidence source={versionQuery.data.sourceProvenance} />
                ) : null}
                <WorkspaceSkillLifecycleRail
                  version={versionQuery.data}
                  validation={validation}
                  installation={installation}
                />
                <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
                  <div>
                    <h3 className="mb-3 text-headline text-label-primary">
                      {t("SETTINGS_WORKSPACE_SKILLS_VERSIONS_TITLE")}
                    </h3>
                    <WorkspaceSkillVersionList
                      versions={versions}
                      selectedId={selectedVersion.id}
                      onSelect={setSelectedVersionId}
                    />
                  </div>
                  <div className="min-w-0">
                    <VersionHeader controller={controller} />
                    <ChecksumCard checksum={versionQuery.data.packageChecksum} />
                    <div className="mt-4">
                      {validation ? (
                        <WorkspaceSkillValidationFindings validation={validation} />
                      ) : (
                        <Alert>
                          <ShieldCheck aria-hidden="true" />
                          <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_NOT_VALIDATED")}</AlertTitle>
                          <AlertDescription>
                            {t("SETTINGS_WORKSPACE_SKILLS_NOT_VALIDATED_DESC")}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                    <Separator className="my-5" />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-headline text-label-primary">
                          {t("SETTINGS_WORKSPACE_SKILLS_INSTALLATION_TITLE")}
                        </h3>
                        <p className="mt-1 text-footnote text-label-secondary">
                          {t("SETTINGS_WORKSPACE_SKILLS_INSTALLATION_DESC")}
                        </p>
                      </div>
                      {installation ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {installationMatchesVersion ? (
                            <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                              <span className="text-footnote font-semibold text-label-primary">
                                {t("SETTINGS_WORKSPACE_SKILLS_INSTALLATION_ENABLED")}
                              </span>
                              <Switch
                                checked={installation.status === "enabled"}
                                disabled={updateInstallationMutation.isPending}
                                onCheckedChange={(checked) =>
                                  updateInstallationMutation.mutate(checked)
                                }
                              />
                            </label>
                          ) : versionQuery.data && validation && installable ? (
                            <WorkspaceSkillUpdateAction
                              workspaceId={workspaceId}
                              installation={installation}
                              candidate={{
                                id: versionQuery.data.id,
                                versionNumber: versionQuery.data.versionNumber,
                                semanticVersion: versionQuery.data.semanticVersion,
                                packageChecksum: versionQuery.data.packageChecksum,
                                validationFindingHash: validation.findingHash,
                                manifest: versionQuery.data.manifest,
                              }}
                            />
                          ) : null}
                          <WorkspaceSkillRemovalAction
                            workspaceId={workspaceId}
                            installation={installation}
                          />
                        </div>
                      ) : !installation ? (
                        <Button
                          disabled={!installable || !capabilitiesQuery.data?.installationAvailable}
                          onClick={() => setDialog("install")}
                        >
                          <PackageCheck data-icon="inline-start" />
                          {t("SETTINGS_WORKSPACE_SKILLS_INSTALL_ACTION")}
                        </Button>
                      ) : null}
                    </div>
                    {installation && !installationMatchesVersion ? (
                      <Alert className="mt-4">
                        <CircleAlert aria-hidden="true" />
                        <AlertTitle>
                          {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_AVAILABLE_TITLE")}
                        </AlertTitle>
                        <AlertDescription>
                          {t(
                            installable
                              ? "SETTINGS_WORKSPACE_SKILLS_UPDATE_AVAILABLE_DESC"
                              : "SETTINGS_WORKSPACE_SKILLS_UPDATE_VALIDATE_DESC",
                          )}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    <ResourceList controller={controller} />
                  </div>
                </div>
              </div>
            ) : null}
          </ContentGuard>
        </section>
      ) : null}
    </ContentGuard>
  );
}

function GitHubSourceEvidence({ source }: { source: Record<string, unknown> }) {
  const { t } = useTranslation("settings");
  const repositoryUrl = sourceValue(source, "repositoryUrl");
  const requestedRef = sourceValue(source, "requestedRef");
  const subpath = sourceValue(source, "subpath");
  const resolvedCommit = sourceValue(source, "resolvedCommit");
  return (
    <Alert>
      <Github aria-hidden="true" />
      <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_GITHUB_EVIDENCE_TITLE")}</AlertTitle>
      <AlertDescription>
        <dl className="grid gap-x-6 gap-y-3 text-caption sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL")}
            </dt>
            <dd className="break-all font-mono text-label-primary">{repositoryUrl}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_LABEL")}
            </dt>
            <dd className="break-all font-mono text-label-primary">{requestedRef}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_LABEL")}
            </dt>
            <dd className="break-all font-mono text-label-primary">
              {subpath || t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_ROOT")}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_COMMIT_LABEL")}
            </dt>
            <dd className="break-all font-mono text-label-primary">{resolvedCommit}</dd>
          </div>
        </dl>
      </AlertDescription>
    </Alert>
  );
}

function sourceValue(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function VersionHeader({ controller }: { controller: WorkspaceSkillsController }) {
  const { t } = useTranslation("settings");
  const version = controller.versionQuery.data!;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline text-label-primary">
            {t("SETTINGS_WORKSPACE_SKILLS_VERSION_NUMBER", { version: version.versionNumber })}
          </h3>
          <SkillStatusBadge status={version.status} />
        </div>
        <p className="mt-1 text-caption text-label-secondary">
          {version.semanticVersion ?? t("SETTINGS_WORKSPACE_SKILLS_SEMANTIC_VERSION_UNSET")}
        </p>
      </div>
      <Button
        variant="outline"
        loading={controller.validationMutation.isPending}
        disabled={
          !controller.capabilitiesQuery.data?.validationAvailable ||
          controller.validationMutation.isPending
        }
        onClick={() => controller.validationMutation.mutate()}
      >
        <ShieldCheck data-icon="inline-start" />
        {t("SETTINGS_WORKSPACE_SKILLS_VALIDATE_ACTION")}
      </Button>
    </div>
  );
}

function ChecksumCard({ checksum }: { checksum: string }) {
  const { t } = useTranslation("settings");
  return (
    <div className="mt-4 grid gap-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote font-semibold text-label-primary">
          {t("SETTINGS_WORKSPACE_SKILLS_CHECKSUM_LABEL")}
        </span>
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("SETTINGS_WORKSPACE_SKILLS_COPY_CHECKSUM")}
          onClick={() => {
            void navigator.clipboard
              .writeText(checksum)
              .then(() => notifySuccessText(t("SETTINGS_WORKSPACE_SKILLS_CHECKSUM_COPIED")))
              .catch(notifyError);
          }}
        >
          <Copy aria-hidden="true" />
        </Button>
      </div>
      <code className="break-all text-caption text-label-secondary">{checksum}</code>
    </div>
  );
}

function ResourceList({ controller }: { controller: WorkspaceSkillsController }) {
  const { t } = useTranslation("settings");
  return (
    <div className="mt-5">
      <h3 className="mb-3 text-headline text-label-primary">
        {t("SETTINGS_WORKSPACE_SKILLS_RESOURCES_TITLE")}
      </h3>
      <div className="divide-y rounded-lg border">
        {controller.versionQuery.data!.resources.map((resource) => (
          <div key={resource.path} className="flex items-center gap-3 px-3 py-3">
            <FileCode2 className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-footnote text-label-primary">
                {resource.path}
              </span>
              <span className="mt-0.5 block text-caption text-label-secondary">
                {resource.mimeType} · {resource.byteSize.toLocaleString()} B
              </span>
            </span>
            <Badge variant="secondary">{resource.role}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
