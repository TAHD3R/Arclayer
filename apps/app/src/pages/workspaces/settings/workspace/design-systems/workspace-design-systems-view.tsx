import { useMemo } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, Palette, Plus, Search } from "lucide-react";
import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";

import type {
  DesignSystemManifestV1,
  DesignSystemSummaryOut,
  DesignSystemVersionSummaryOut,
} from "@arclayer/openapi";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      {controller.capabilitiesQuery.isError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_LOAD_ERROR_TITLE")}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2" aria-live="polite">
            <span>{t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_LOAD_ERROR_DESC")}</span>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => void controller.capabilitiesQuery.refetch()}
            >
              {t("common:RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

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
        {controller.systems.length ? (
          <Button onClick={() => controller.setDialog("system")}>
            <Plus data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION")}
          </Button>
        ) : null}
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
          <div className="grid min-h-[42rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[18rem_minmax(0,1fr)]">
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

function localizedFindingMessage(i18n: I18nInstance, messageKey: string): string {
  const normalizedKey = messageKey.trim();
  const resourceKey = `errors:${normalizedKey}`;
  if (!normalizedKey || !i18n.exists(resourceKey)) {
    throw new Error(`Missing Design System finding translation: ${messageKey}`);
  }
  const translated = i18n.t(resourceKey);
  if (typeof translated !== "string" || !translated.trim() || translated === resourceKey) {
    throw new Error(`Invalid Design System finding translation: ${messageKey}`);
  }
  return translated;
}

function DesignSystemDetail({ controller }: { controller: WorkspaceDesignSystemsController }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const system = controller.selectedSystem!;
  const validation = controller.latestValidation;
  const manifest = controller.versionQuery.data?.manifest;
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
          <div className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              {manifest ? <DesignSystemPreview name={system.name} manifest={manifest} /> : null}

              {validation?.findings.length ? (
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
                            {localizedFindingMessage(i18n, finding.messageKey)}
                          </p>
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
                    {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UPDATE_NUMBER", {
                      number: version.versionNumber,
                    })}
                  </span>
                  <VersionStatus version={version} />
                </span>
                <span className="mt-1 block text-caption text-label-secondary">
                  {date.format(new Date(version.createdAt))}
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
    <Empty className="min-h-[14rem] border bg-card">
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

function DesignSystemPreview(props: { name: string; manifest: DesignSystemManifestV1 }) {
  const { t } = useTranslation("settings");
  const colors = previewColors(props.manifest);
  const tokens = props.manifest.primitiveTokens ?? {};
  const font = fontFamily(tokens);
  return (
    <section aria-labelledby="design-system-preview-title">
      <div>
        <h3 id="design-system-preview-title" className="text-headline text-label-primary">
          {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_TITLE")}
        </h3>
        <p className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_DESC")}
        </p>
      </div>
      <div
        className="mt-4 overflow-hidden rounded-xl border"
        style={{ backgroundColor: colors.canvas, color: colors.ink, fontFamily: font }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: colors.border }}
        >
          <span className="text-sm font-semibold">{props.name}</span>
          <span className="text-xs" style={{ color: colors.secondary }}>
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_NAV")}
          </span>
        </div>
        <div className="grid gap-5 px-5 py-8 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
          <div>
            <p className="text-2xl font-semibold leading-tight">
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_HEADING")}
            </p>
            <p className="mt-3 max-w-md text-sm leading-6" style={{ color: colors.secondary }}>
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_BODY")}
            </p>
            <button
              type="button"
              className="mt-5 rounded-md px-4 py-2 text-sm font-semibold"
              style={{ backgroundColor: colors.action, color: colors.actionText }}
            >
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_ACTION")}
            </button>
          </div>
          <div className="rounded-lg border p-4" style={{ borderColor: colors.border }}>
            <p className="text-xs font-medium" style={{ color: colors.secondary }}>
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_CARD_LABEL")}
            </p>
            <p className="mt-2 text-xl font-semibold">24</p>
            <div className="mt-4 h-2 rounded-full" style={{ backgroundColor: colors.border }}>
              <div
                className="h-full w-2/3 rounded-full"
                style={{ backgroundColor: colors.action }}
              />
            </div>
          </div>
        </div>
      </div>
      <div
        className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-4"
        aria-label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PALETTE_LABEL")}
      >
        {colors.palette.map((color) => (
          <div key={color.labelKey} className="min-w-0 border-r last:border-r-0">
            <div className="h-12" style={{ backgroundColor: color.value }} />
            <div className="border-t px-2 py-2">
              <p className="text-caption font-medium text-label-primary">{t(color.labelKey)}</p>
              <p className="mt-0.5 font-mono text-caption text-label-secondary">{color.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function previewColors(manifest: DesignSystemManifestV1) {
  const tokens = manifest.primitiveTokens ?? {};
  const palette = [
    ["SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CANVAS_COLOR_LABEL", "primitive.color.canvas", "#FFFFFF"],
    [
      "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PRIMARY_TEXT_COLOR_LABEL",
      "primitive.color.ink",
      "#111111",
    ],
    ["SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_COLOR_LABEL", "primitive.color.action", "#155EEF"],
    ["SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BORDER_COLOR_LABEL", "primitive.color.border", "#D5D7DA"],
  ].map(([labelKey, path, fallback]) => ({
    labelKey,
    value: tokenString(tokens, path, fallback),
  }));
  return {
    canvas: palette[0].value,
    ink: palette[1].value,
    action: palette[2].value,
    border: palette[3].value,
    secondary: tokenString(tokens, "primitive.color.muted", palette[1].value),
    actionText: tokenString(tokens, "primitive.color.on-action", "#FFFFFF"),
    palette,
  };
}

function fontFamily(tokens: Record<string, { value?: unknown }>) {
  const value = tokens["primitive.font.family.body"]?.value;
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string").join(", ");
  return typeof value === "string" ? value : "inherit";
}

function tokenString(tokens: Record<string, { value?: unknown }>, path: string, fallback: string) {
  return typeof tokens[path]?.value === "string" ? tokens[path].value : fallback;
}
