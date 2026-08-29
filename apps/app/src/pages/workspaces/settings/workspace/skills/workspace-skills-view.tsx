import {
  Archive,
  Check,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  FileArchive,
  Github,
  MessageCircle,
  PackageCheck,
  PencilRuler,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import type { SkillInstallationOut, SkillPackageSummaryOut } from "@arclayer/openapi";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import {
  AI_COMPOSER_SKILL_CREATOR_COMMAND,
  useAIComposerDirectiveStore,
} from "@/components/ai/ai-composer-directives";
import { useEnabledAIComposerSkills } from "@/components/ai/ai-composer-skill-menu";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Switch } from "@arclayer/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import type { WorkspaceSkillCreateAction } from "./page";
import type { WorkspaceSkillScope } from "./workspace-skill-scope-tabs";
import { useWorkspaceSkillsController } from "./use-workspace-skills-controller";
import { WorkspaceSkillsScopeEmpty } from "./workspace-skills-components";
import { WorkspaceSkillValidationFindings } from "./workspace-skills-boundaries";
import {
  WorkspaceSkillPackageCreateDialog,
  WorkspaceSkillVersionCreateDialog,
} from "./workspace-skill-authoring-dialog";
import { WorkspaceSkillCard, WorkspaceSkillCardGrid } from "./workspace-skill-card";
import { WorkspaceSkillDetailDialog } from "./workspace-skill-detail-dialog";
import { WorkspaceSkillGitHubStatus } from "./workspace-skill-github-status";
import {
  WorkspaceSkillImportDialog,
  type WorkspaceSkillImportMode,
} from "./workspace-skill-import-dialog";
import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";
import { WorkspaceOfficialSkillsSection } from "./workspace-official-skills-section";
import { WorkspaceSkillPackageArchiveAction } from "./workspace-skill-package-archive-action";
import { WorkspaceSkillRemovalAction } from "./workspace-skill-removal-action";
import { WorkspaceSkillUpdateAction } from "./workspace-skill-update-action";

/**
 * Header creation entry points beyond the direct import/create dialogs.
 * "browse-official" switches to the official catalog tab instead of opening a
 * dialog; it stays out of the route-level action union because it never comes
 * from a URL parameter.
 */
export type WorkspaceSkillsHeaderAction = WorkspaceSkillCreateAction | "browse-official";

export function WorkspaceSkillsView({
  workspaceId,
  scope,
  search,
  onSearchChange,
  requestedAction,
  focusRequestId,
}: {
  scope: WorkspaceSkillScope;
  workspaceId: string;
  search: string;
  onSearchChange: (value: string) => void;
  requestedAction?: WorkspaceSkillCreateAction;
  focusRequestId?: number;
}) {
  const controller = useWorkspaceSkillsController(workspaceId, search);
  const [importMode, setImportMode] = useState<WorkspaceSkillImportMode>("github");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [removalDialogOpen, setRemovalDialogOpen] = useState(false);
  const {
    capabilitiesQuery,
    packageQuery,
    versionQuery,
    dialog,
    setDialog,
    createPackageMutation,
    createVersionMutation,
    githubImportMutation,
    zipImportMutation,
    installMutation,
    validation,
  } = controller;

  useEffect(() => {
    if (requestedAction === "manual") setDialog("manual");
    if (requestedAction === "github" || requestedAction === "zip") {
      setImportMode(requestedAction);
      setDialog("import");
    }
  }, [focusRequestId, requestedAction, setDialog]);

  const closeDetailDialogs = () => {
    setArchiveDialogOpen(false);
    setRemovalDialogOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-8">
      {capabilitiesQuery.isError ? (
        <AuthorityError onRetry={() => void capabilitiesQuery.refetch()} />
      ) : null}

      {scope === "official" ? (
        <WorkspaceOfficialSkillsSection
          onSearchChange={onSearchChange}
          search={search}
          workspaceId={workspaceId}
        />
      ) : (
        <div className="space-y-5">
          <WorkspaceSkillGitHubStatus
            accepted={controller.githubOperation ?? undefined}
            error={controller.githubImportQuery.isError}
            loading={controller.githubImportQuery.isFetching}
            onRetry={() => void controller.githubImportQuery.refetch()}
            operation={controller.githubImportQuery.data}
          />
          <WorkspaceSkillCatalogGrid
            controller={controller}
            mineScope={scope === "mine"}
            onOpenArchive={() => setArchiveDialogOpen(true)}
            onOpenRemoval={() => setRemovalDialogOpen(true)}
            onSelectPackage={() => closeDetailDialogs()}
          />
        </div>
      )}

      <WorkspaceSkillPackageCreateDialog
        onOpenChange={(open) => setDialog(open ? "manual" : null)}
        onSubmit={(payload) => createPackageMutation.mutateAsync(payload).then(() => undefined)}
        open={dialog === "manual"}
        pending={createPackageMutation.isPending}
      />
      <WorkspaceSkillImportDialog
        githubPending={githubImportMutation.isPending}
        initialMode={importMode}
        onGitHubSubmit={(payload) =>
          githubImportMutation.mutateAsync(payload).then(() => undefined)
        }
        onOpenChange={(open) => setDialog(open ? "import" : null)}
        onZipSubmit={(file) => zipImportMutation.mutateAsync(file).then(() => undefined)}
        open={dialog === "import"}
        zipPending={zipImportMutation.isPending}
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

      {packageQuery.data ? (
        <WorkspaceSkillPackageArchiveAction
          metadataRevision={packageQuery.data.metadataRevision}
          onOpenChange={setArchiveDialogOpen}
          open={archiveDialogOpen}
          packageId={packageQuery.data.id}
          workspaceId={workspaceId}
        />
      ) : null}
      {controller.installation ? (
        <WorkspaceSkillRemovalAction
          installation={controller.installation}
          onOpenChange={setRemovalDialogOpen}
          open={removalDialogOpen}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSkillCatalogGrid(
  props: Readonly<{
    controller: ReturnType<typeof useWorkspaceSkillsController>;
    mineScope?: boolean;
    onOpenArchive: () => void;
    onOpenRemoval: () => void;
    onSelectPackage: () => void;
  }>,
) {
  const { t } = useTranslation("settings");
  const controller = props.controller;
  const { profile, isLoading: profileLoading } = useCurrentUserProfile();
  const {
    packagesQuery,
    installationsQuery,
    packageQuery,
    versionQuery,
    versionsQuery,
    packages,
    installations,
    selectedPackage,
    setSelectedPackageId,
  } = controller;

  const installationByPackage = useMemo(
    () => new Map(installations.map((installation) => [installation.packageId, installation])),
    [installations],
  );
  const visiblePackages = props.mineScope
    ? packages.filter((skillPackage) => skillPackage.createdByUserId === profile?.id)
    : packages;
  const loading = Boolean(
    packagesQuery.isLoading || installationsQuery.isLoading || (props.mineScope && profileLoading),
  );

  return (
    <>
      <ContentGuard
        error={packagesQuery.error ?? installationsQuery.error}
        loading={loading}
        loadingVariant="card-grid"
        onRetry={() => {
          void packagesQuery.refetch();
          void installationsQuery.refetch();
        }}
      >
        {visiblePackages.length ? (
          <WorkspaceSkillCardGrid>
            {visiblePackages.map((skillPackage) => (
              <WorkspaceSkillPackageCard
                installation={installationByPackage.get(skillPackage.id)}
                key={skillPackage.id}
                onSelect={() => {
                  props.onSelectPackage();
                  setSelectedPackageId(skillPackage.id);
                }}
                skillPackage={skillPackage}
              />
            ))}
          </WorkspaceSkillCardGrid>
        ) : (
          <WorkspaceSkillsScopeEmpty />
        )}
      </ContentGuard>

      <WorkspaceSkillDetailDialog
        actions={
          selectedPackage ? (
            <WorkspaceSkillDetailActions
              controller={controller}
              onOpenArchive={props.onOpenArchive}
              onOpenRemoval={props.onOpenRemoval}
            />
          ) : undefined
        }
        belowDescription={
          controller.validation ? (
            <WorkspaceSkillValidationFindings validation={controller.validation} />
          ) : undefined
        }
        description={packageQuery.data?.description ?? selectedPackage?.description ?? null}
        files={versionQuery.data?.resources ?? []}
        icon={<SkillSourceIcon sourceKind={selectedPackage?.sourceKind} />}
        loading={packageQuery.isLoading || versionsQuery.isLoading || versionQuery.isLoading}
        onOpenChange={(open) => {
          if (!open) setSelectedPackageId(null);
        }}
        open={Boolean(selectedPackage)}
        subtitle={
          selectedPackage
            ? `${t("SETTINGS_WORKSPACE_SKILLS_CREATED_BY", {
                name: selectedPackage.publisherName,
              })}${
                controller.selectedVersion?.semanticVersion
                  ? ` · v${controller.selectedVersion.semanticVersion}`
                  : ""
              }`
            : null
        }
        title={packageQuery.data?.displayName ?? selectedPackage?.displayName ?? ""}
      />
    </>
  );
}

function WorkspaceSkillPackageCard(
  props: Readonly<{
    installation?: SkillInstallationOut;
    onSelect: () => void;
    skillPackage: SkillPackageSummaryOut;
  }>,
) {
  const { t } = useTranslation("settings");
  const { installation, skillPackage } = props;
  return (
    <WorkspaceSkillCard
      action={
        installation ? (
          installation.status === "enabled" ? (
            <span className="inline-flex size-8 items-center justify-center">
              <Check aria-hidden="true" className="size-5" strokeWidth={2} />
              <span className="sr-only">{t("SETTINGS_WORKSPACE_SKILLS_CARD_ADDED")}</span>
            </span>
          ) : (
            <span className="text-caption text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_CARD_DISABLED")}
            </span>
          )
        ) : (
          <Button onClick={props.onSelect} size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            {t("SETTINGS_WORKSPACE_SKILLS_CARD_ADD")}
          </Button>
        )
      }
      description={skillPackage.description}
      icon={<SkillSourceIcon sourceKind={skillPackage.sourceKind} />}
      meta={t("SETTINGS_WORKSPACE_SKILLS_CREATED_BY", { name: skillPackage.publisherName })}
      onSelect={props.onSelect}
      title={skillPackage.displayName}
    />
  );
}

function SkillSourceIcon(props: Readonly<{ sourceKind?: string }>) {
  if (props.sourceKind === "github") return <Github aria-hidden="true" />;
  if (props.sourceKind === "archive") return <FileArchive aria-hidden="true" />;
  return <PencilRuler aria-hidden="true" />;
}

function WorkspaceSkillDetailActions(
  props: Readonly<{
    controller: ReturnType<typeof useWorkspaceSkillsController>;
    onOpenArchive: () => void;
    onOpenRemoval: () => void;
  }>,
) {
  const { t } = useTranslation("settings");
  const controller = props.controller;
  const {
    capabilitiesQuery,
    packageQuery,
    versionQuery,
    versions,
    selectedVersion,
    setSelectedVersionId,
    installation,
    validation,
    setDialog,
    validationMutation,
    githubRefreshMutation,
    updateInstallationMutation,
  } = controller;

  const installable = Boolean(validation && ["valid", "warning"].includes(validation.status));
  const installationMatchesVersion = installation?.versionId === versionQuery.data?.id;
  const isGitHubSource = packageQuery.data?.sourceKind === "github";

  return (
    <>
      {installation ? (
        installationMatchesVersion ? (
          <label className="flex h-10 items-center gap-2.5 rounded-lg border px-3">
            <span className="text-footnote font-semibold text-label-primary">
              {t("SETTINGS_WORKSPACE_SKILLS_INSTALLATION_ENABLED")}
            </span>
            <Switch
              checked={installation.status === "enabled"}
              disabled={updateInstallationMutation.isPending}
              onCheckedChange={(checked) => updateInstallationMutation.mutate(checked)}
            />
          </label>
        ) : versionQuery.data && validation && installable ? (
          <WorkspaceSkillUpdateAction
            workspaceId={controller.workspaceId}
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
        ) : null
      ) : (
        <Button
          disabled={!installable || !capabilitiesQuery.data?.installationAvailable}
          onClick={() => setDialog("install")}
          size="sm"
        >
          <PackageCheck data-icon="inline-start" />
          {t("SETTINGS_WORKSPACE_SKILLS_INSTALL_ACTION")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("SETTINGS_WORKSPACE_SKILLS_DETAIL_MORE")}
            size="icon"
            variant="ghost"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {versions.length > 1 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <span>{t("SETTINGS_WORKSPACE_SKILLS_VERSION_SELECTOR_LABEL")}</span>
                <span className="font-mono text-label-secondary">
                  {selectedVersion?.semanticVersion ?? `v${selectedVersion?.versionNumber}`}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {versions.map((version) => (
                  <DropdownMenuItem
                    className="gap-2"
                    key={version.id}
                    onSelect={() => setSelectedVersionId(version.id)}
                  >
                    <span className="font-mono">
                      {version.semanticVersion ?? `v${version.versionNumber}`}
                    </span>
                    {version.id === selectedVersion?.id ? (
                      <Check aria-hidden="true" className="ml-auto size-3.5" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          <DropdownMenuItem
            className="gap-2"
            disabled={!capabilitiesQuery.data?.validationAvailable || validationMutation.isPending}
            onSelect={() => validationMutation.mutate()}
          >
            <ShieldCheck aria-hidden="true" />
            {t("SETTINGS_WORKSPACE_SKILLS_VALIDATE_ACTION")}
          </DropdownMenuItem>
          {isGitHubSource ? (
            <DropdownMenuItem
              className="gap-2"
              disabled={
                githubRefreshMutation.isPending || !capabilitiesQuery.data?.githubImportAvailable
              }
              onSelect={() => githubRefreshMutation.mutate()}
            >
              <RefreshCw aria-hidden="true" />
              {t("SETTINGS_WORKSPACE_SKILLS_GITHUB_REFRESH_ACTION")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="gap-2" onSelect={() => setDialog("version")}>
              <Plus aria-hidden="true" />
              {t("SETTINGS_WORKSPACE_SKILLS_VERSION_CREATE_ACTION")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" variant="destructive" onSelect={props.onOpenArchive}>
            <Archive aria-hidden="true" />
            {t("SETTINGS_WORKSPACE_SKILLS_PACKAGE_ARCHIVE_REVIEW_ACTION")}
          </DropdownMenuItem>
          {installation ? (
            <DropdownMenuItem
              className="gap-2"
              variant="destructive"
              onSelect={props.onOpenRemoval}
            >
              <Trash2 aria-hidden="true" />
              {t("SETTINGS_WORKSPACE_SKILLS_REMOVE_REVIEW_ACTION")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function WorkspaceSkillsHeaderActions({
  scope,
  workspaceId,
  onSelect,
}: Readonly<{
  scope: WorkspaceSkillScope;
  workspaceId: string;
  onSelect: (action: WorkspaceSkillsHeaderAction) => void;
}>) {
  const navigate = useNavigate();
  const creatorSkillsQuery = useEnabledAIComposerSkills({ workspaceId });
  const skillCreator = creatorSkillsQuery.skills.find(
    (skill) => skill.command === AI_COMPOSER_SKILL_CREATOR_COMMAND,
  );
  const { t } = useTranslation("settings");

  const labelKey =
    scope === "mine"
      ? "SETTINGS_WORKSPACE_SKILLS_CREATE_FOR_MINE"
      : "SETTINGS_WORKSPACE_SKILLS_CREATE_FOR_WORKSPACE";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t(labelKey)} className="h-10 gap-1.5 pl-4 pr-3">
          {t(labelKey)}
          <ChevronDown aria-hidden="true" className="size-4 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {scope === "mine" ? (
          <>
            <SkillCreateMenuItem
              icon={<MessageCircle aria-hidden="true" />}
              label={t("SETTINGS_WORKSPACE_SKILLS_CREATE_WITH_CHAT")}
              disabled={creatorSkillsQuery.isLoading || !skillCreator}
              onSelect={() => {
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
            />
            <SkillCreateMenuItem
              icon={<ShieldCheck aria-hidden="true" />}
              label={t("SETTINGS_WORKSPACE_SKILLS_ADD_FROM_OFFICIAL")}
              onSelect={() => onSelect("browse-official")}
            />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <SkillCreateMenuItem
          icon={<Upload aria-hidden="true" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_UPLOAD_ZIP")}
          onSelect={() => onSelect("zip")}
        />
        <SkillCreateMenuItem
          icon={<Github aria-hidden="true" />}
          label={t("SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB")}
          onSelect={() => onSelect("github")}
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

export function WorkspaceSkillsSearchControl(
  props: Readonly<{
    onChange: (value: string) => void;
    value: string;
  }>,
) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const active = Boolean(props.value.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("SETTINGS_WORKSPACE_SKILLS_SEARCH_LABEL")}
          className={active ? "" : "text-label-secondary"}
          size="icon-lg"
          variant="ghost"
        >
          <Search aria-hidden="true" />
          {active ? (
            <span
              aria-hidden="true"
              className="absolute right-2 top-2 size-1.5 rounded-full bg-foreground"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
          />
          <Input
            aria-label={t("SETTINGS_WORKSPACE_SKILLS_SEARCH_LABEL")}
            autoFocus
            className="pl-9"
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={t("SETTINGS_WORKSPACE_SKILLS_SEARCH_PLACEHOLDER")}
            value={props.value}
          />
        </div>
      </PopoverContent>
    </Popover>
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
