import { useMemo } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DesignSystemSummaryOut, DesignSystemVersionSummaryOut } from "@arclayer/openapi";
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
import { ContentGuard } from "@/layouts/page-shell/content-guard";

import {
  WorkspaceDesignSystemCreateDialog,
  WorkspaceDesignSystemVersionDialog,
} from "./workspace-design-system-dialogs";
import {
  useWorkspaceDesignSystemsController,
  type WorkspaceDesignSystemsController,
} from "./use-workspace-design-systems-controller";

export function WorkspaceDesignSystemsView({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const controller = useWorkspaceDesignSystemsController(workspaceId);
  const capabilityKey = controller.capabilitiesQuery.isPending
    ? "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_AUTHORITY_LOADING"
    : controller.capabilitiesQuery.isError
      ? "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_AUTHORITY_ERROR"
      : "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_AUTHORITY_FOUNDATION";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      <Alert variant={controller.capabilitiesQuery.isError ? "destructive" : "default"}>
        {controller.capabilitiesQuery.isError ? (
          <CircleAlert aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        <AlertTitle>{t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_AUTHORITY_TITLE")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2" aria-live="polite">
          <span>{t(`settings:${capabilityKey}`)}</span>
          {controller.capabilitiesQuery.isError ? (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void controller.capabilitiesQuery.refetch()}
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
            value={controller.search}
            onChange={(event) => controller.setSearch(event.target.value)}
            aria-label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SEARCH_LABEL")}
            placeholder={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SEARCH_PLACEHOLDER")}
          />
        </div>
        <Button onClick={() => controller.setDialog("system")}>
          <Plus data-icon="inline-start" />
          {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION")}
        </Button>
      </div>

      <ContentGuard
        loading={controller.systemsQuery.isLoading || controller.defaultQuery.isLoading}
        error={controller.systemsQuery.error ?? controller.defaultQuery.error}
        onRetry={() => {
          void controller.systemsQuery.refetch();
          void controller.defaultQuery.refetch();
        }}
        loadingVariant="form"
      >
        {!controller.systems.length ? (
          <DesignSystemsEmpty onCreate={() => controller.setDialog("system")} />
        ) : controller.selectedSystem ? (
          <div className="grid min-h-[42rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[19rem_minmax(0,1fr)]">
            <aside
              className="border-b bg-muted/30 lg:border-b-0 lg:border-r"
              aria-label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_LIST_LABEL")}
            >
              {controller.systems.map((system) => (
                <SystemRow
                  key={system.id}
                  system={system}
                  selected={system.id === controller.selectedSystem?.id}
                  onSelect={() => controller.setSelectedSystemId(system.id)}
                />
              ))}
            </aside>
            <DesignSystemDetail controller={controller} />
          </div>
        ) : null}
      </ContentGuard>

      <WorkspaceDesignSystemCreateDialog
        open={controller.dialog === "system"}
        onOpenChange={(open) => controller.setDialog(open ? "system" : null)}
        pending={controller.createSystemMutation.isPending}
        error={controller.createSystemMutation.error}
        onSubmit={(payload, key) => {
          controller.createSystemMutation.mutate(
            { payload, key },
            { onSuccess: () => controller.setDialog(null) },
          );
        }}
      />
      <WorkspaceDesignSystemVersionDialog
        open={controller.dialog === "version"}
        onOpenChange={(open) => controller.setDialog(open ? "version" : null)}
        pending={controller.createVersionMutation.isPending}
        error={controller.createVersionMutation.error}
        source={controller.versionQuery.data?.manifest}
        parentVersionId={controller.versions[0]?.id}
        parentChecksum={controller.versions[0]?.manifestChecksum}
        componentCatalogs={controller.componentCatalogsQuery.data ?? []}
        componentCatalogsPending={controller.componentCatalogsQuery.isPending}
        componentCatalogsError={controller.componentCatalogsQuery.error}
        onSubmit={(payload, key) => {
          controller.createVersionMutation.mutate(
            { payload, key },
            { onSuccess: () => controller.setDialog(null) },
          );
        }}
      />
    </div>
  );
}

function SystemRow(props: {
  system: DesignSystemSummaryOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <button
      type="button"
      className={
        "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors duration-100 last:border-b-0 " +
        (props.selected ? "bg-primary/6" : "hover:bg-accent/60")
      }
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-label-secondary">
        <Palette className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-footnote font-semibold text-label-primary">
            {props.system.name}
          </span>
          {props.system.isDefault ? (
            <span className="text-caption font-medium text-primary">
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_SHORT")}
            </span>
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 text-caption leading-5 text-label-secondary">
          {props.system.description ?? t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_NO_DESCRIPTION")}
        </span>
        <span className="mt-2 block text-caption tabular-nums text-label-secondary">
          {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_COUNT", {
            count: props.system.versionCount,
          })}
        </span>
      </span>
    </button>
  );
}

function DesignSystemDetail({ controller }: { controller: WorkspaceDesignSystemsController }) {
  const { t } = useTranslation(["settings", "common"]);
  const system = controller.selectedSystem!;
  const validation = controller.latestValidation;
  const palette = paletteValues(controller.versionQuery.data?.manifest.primitiveTokens);
  return (
    <section className="min-w-0 p-5 sm:p-6" aria-labelledby="workspace-design-system-detail-title">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="workspace-design-system-detail-title"
              className="text-title2 font-bold text-label-primary"
            >
              {system.name}
            </h2>
            {system.isDefault ? (
              <span className="flex items-center gap-1 text-footnote font-medium text-primary">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_ACTIVE")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-footnote text-label-secondary">
            {system.description ?? t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_NO_DESCRIPTION")}
          </p>
        </div>
        <Button onClick={controller.openVersionDialog}>
          <Plus data-icon="inline-start" />
          {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION")}
        </Button>
      </div>

      <ContentGuard
        loading={controller.versionsQuery.isLoading || controller.versionQuery.isLoading}
        error={controller.versionsQuery.error ?? controller.versionQuery.error}
        onRetry={() => {
          void controller.versionsQuery.refetch();
          void controller.versionQuery.refetch();
        }}
        loadingVariant="form"
      >
        {!controller.versions.length ? (
          <div className="py-12 text-center">
            <p className="text-headline text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_EMPTY_TITLE")}
            </p>
            <p className="mx-auto mt-2 max-w-lg text-footnote text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_EMPTY_DESC")}
            </p>
            <Button className="mt-4" onClick={controller.openVersionDialog}>
              {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 className="text-headline text-label-primary">
                    {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FOUNDATION_TITLE")}
                  </h3>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FOUNDATION_DESC")}
                  </p>
                </div>
                <span className="font-mono text-caption text-label-secondary">
                  {controller.versionQuery.data?.manifestChecksum.slice(7, 19)}
                </span>
              </div>
              <div
                className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border"
                aria-label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PALETTE_LABEL")}
              >
                {palette.map((color) => (
                  <div key={color.path} className="min-w-0">
                    <div className="h-16" style={{ backgroundColor: color.value }} />
                    <div className="border-t px-2 py-2 font-mono text-caption text-label-secondary">
                      {color.value}
                    </div>
                  </div>
                ))}
              </div>

              <Alert className="mt-5">
                <Sparkles aria-hidden="true" />
                <AlertTitle>
                  {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PUBLISH_GATED_TITLE")}
                </AlertTitle>
                <AlertDescription>
                  {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PUBLISH_GATED_DESC")}
                </AlertDescription>
              </Alert>

              {validation ? (
                <div className="mt-6">
                  <h3 className="text-headline text-label-primary">
                    {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FINDINGS_TITLE")}
                  </h3>
                  <div className="mt-3 divide-y rounded-lg border">
                    {validation.findings.map((finding) => (
                      <div
                        key={`${finding.code}:${finding.path ?? "root"}`}
                        className="flex gap-3 px-4 py-3"
                      >
                        {finding.severity === "blocker" ? (
                          <CircleAlert
                            className="mt-0.5 size-4 shrink-0 text-destructive"
                            aria-hidden="true"
                          />
                        ) : (
                          <CircleDashed
                            className="mt-0.5 size-4 shrink-0 text-label-secondary"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-footnote font-medium text-label-primary">
                            {finding.message}
                          </p>
                          {finding.path ? (
                            <p className="mt-1 break-all font-mono text-caption text-label-secondary">
                              {finding.path}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <VersionEvidenceTrack controller={controller} />
          </div>
        )}
      </ContentGuard>
    </section>
  );
}

function VersionEvidenceTrack({ controller }: { controller: WorkspaceDesignSystemsController }) {
  const { t, i18n } = useTranslation("settings");
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );
  return (
    <aside aria-label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_TRACK_LABEL")}>
      <h3 className="text-headline text-label-primary">
        {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_TRACK_TITLE")}
      </h3>
      <div className="mt-4 border-l pl-4">
        {controller.versions.map((version) => {
          const selected = version.id === controller.selectedVersion?.id;
          const isDefault = controller.defaultQuery.data?.versionId === version.id;
          return (
            <div key={version.id} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[1.31rem] top-2 size-2 rounded-full bg-label-tertiary ring-4 ring-card" />
              <button
                type="button"
                className={
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors duration-100 " +
                  (selected ? "border-primary bg-primary/5" : "hover:bg-accent/60")
                }
                aria-current={selected ? "true" : undefined}
                onClick={() => controller.setSelectedVersionId(version.id)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-footnote font-semibold tabular-nums text-label-primary">
                    v{version.versionNumber}
                  </span>
                  <VersionStatus version={version} />
                </span>
                <span className="mt-1 block text-caption text-label-secondary">
                  {date.format(new Date(version.createdAt))}
                </span>
                <span className="mt-2 block font-mono text-caption text-label-secondary">
                  {version.manifestChecksum.slice(7, 19)}
                </span>
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={controller.validateMutation.isPending}
                  loading={controller.validateMutation.isPending && selected}
                  onClick={() => controller.runVersionCommand("validate", version.id)}
                >
                  {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VALIDATE_ACTION")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    version.validationStatus !== "valid" ||
                    isDefault ||
                    controller.defaultMutation.isPending
                  }
                  loading={controller.defaultMutation.isPending && selected}
                  onClick={() => controller.runVersionCommand("default", version.id)}
                >
                  {isDefault
                    ? t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_ACTIVE")
                    : t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SET_DEFAULT_ACTION")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function VersionStatus({ version }: { version: DesignSystemVersionSummaryOut }) {
  const { t } = useTranslation("settings");
  if (version.validationStatus === "valid") {
    return (
      <span className="flex items-center gap-1 text-caption text-positive">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_STATUS_VALID")}
      </span>
    );
  }
  if (version.validationStatus === "invalid") {
    return (
      <span className="flex items-center gap-1 text-caption text-destructive">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_STATUS_INVALID")}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-caption text-label-secondary">
      <CircleDashed className="size-3.5" aria-hidden="true" />
      {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_STATUS_UNVALIDATED")}
    </span>
  );
}

function DesignSystemsEmpty({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation("settings");
  return (
    <Empty className="min-h-[32rem] border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Palette aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_EMPTY_TITLE")}</EmptyTitle>
        <EmptyDescription>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_EMPTY_DESC")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate}>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION")}</Button>
      </EmptyContent>
    </Empty>
  );
}

function paletteValues(tokens: Record<string, { value?: unknown }> | undefined) {
  const paths = [
    "primitive.color.canvas",
    "primitive.color.ink",
    "primitive.color.action",
    "primitive.color.border",
  ];
  return paths.map((path) => ({
    path,
    value: typeof tokens?.[path]?.value === "string" ? tokens[path].value : "transparent",
  }));
}
