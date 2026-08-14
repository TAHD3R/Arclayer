import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Palette,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
} from "lucide-react";
import type { i18n as I18nInstance } from "i18next";
import { useTranslation } from "react-i18next";

import type { ComponentCatalogV1, DesignSystemSummaryOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@arclayer/ui/button-group";
import { ColorPickerContent } from "@arclayer/ui/color-picker";
import { ConfirmDialog } from "@arclayer/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Textarea } from "@arclayer/ui/textarea";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";

import {
  useWorkspaceDesignSystemCardManifest,
  useWorkspaceDesignSystemsController,
  type WorkspaceDesignSystemsController,
} from "./use-workspace-design-systems-controller";
import {
  MOTION_EASING_PRESETS,
  type DesignSystemFoundationValues,
} from "./workspace-design-system-manifest";

export function WorkspaceDesignSystemsView({
  workspaceId,
  onControllerChange,
}: {
  workspaceId: string;
  onControllerChange?: (controller: WorkspaceDesignSystemsController | null) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const controller = useWorkspaceDesignSystemsController(workspaceId);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // The page header consumes view/dirty/save state, so republish the lifted
  // controller whenever those primitives change. Primitive deps keep this
  // effect from looping while the controller object itself is unstable.
  const viewMode = controller.viewMode;
  const draftDirty = controller.draftDirty;
  const canSave = controller.canSave;
  const saving = controller.saving;
  const historyOpen = controller.historyOpen;
  const hasDraft = Boolean(controller.draft);
  useEffect(() => {
    onControllerChange?.(controllerRef.current);
  }, [onControllerChange, viewMode, draftDirty, canSave, saving, historyOpen, hasDraft]);
  useEffect(() => {
    return () => onControllerChange?.(null);
  }, [onControllerChange]);

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

      <ContentGuard
        loading={controller.systemsQuery.isLoading || controller.defaultQuery.isLoading}
        error={controller.systemsQuery.error ?? controller.defaultQuery.error}
        onRetry={() => {
          void controller.systemsQuery.refetch();
          void controller.defaultQuery.refetch();
        }}
        loadingVariant="form"
      >
        {controller.viewMode === "detail" ? (
          <DesignSystemDetail controller={controller} />
        ) : !controller.systems.length ? (
          <DesignSystemsEmpty onCreate={controller.openNewSystemDraft} />
        ) : (
          <DesignSystemsGrid workspaceId={workspaceId} controller={controller} />
        )}
      </ContentGuard>
    </div>
  );
}

export function DesignSystemHeaderTitle({
  controller,
}: {
  controller: WorkspaceDesignSystemsController;
}) {
  const { t } = useTranslation("settings");
  const isNew = controller.draft?.isNew ?? false;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <EditableText
        value={controller.draft?.name ?? ""}
        placeholder={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNTITLED")}
        ariaLabel={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TITLE_EDIT_LABEL")}
        onCommit={(name) => controller.updateDraftMeta({ name })}
      />
      {controller.draftDirty ? (
        <BaseTag>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNSAVED")}</BaseTag>
      ) : null}
      {!isNew && controller.selectedSystem?.isDefault ? (
        <BaseTag color="blue" icon={lucideTagIcon(CheckCircle2)}>
          {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_ACTIVE")}
        </BaseTag>
      ) : null}
    </span>
  );
}

export function DesignSystemHeaderDescription({
  controller,
}: {
  controller: WorkspaceDesignSystemsController;
}) {
  const { t } = useTranslation("settings");
  return (
    <EditableText
      value={controller.draft?.description ?? ""}
      placeholder={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DESCRIPTION_PLACEHOLDER")}
      ariaLabel={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DESCRIPTION_EDIT_LABEL")}
      multiline
      onCommit={(description) => controller.updateDraftMeta({ description })}
    />
  );
}

export function WorkspaceDesignSystemsHeaderActions({
  controller,
}: {
  controller: WorkspaceDesignSystemsController;
}) {
  const { t } = useTranslation(["settings", "common"]);

  if (controller.viewMode === "detail") {
    const isDefault = controller.defaultQuery.data?.versionId === controller.selectedVersion?.id;
    const defaultDisabled =
      controller.draft?.isNew ||
      !controller.selectedVersion ||
      controller.selectedVersion.validationStatus !== "valid" ||
      isDefault ||
      controller.defaultMutation.isPending;
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={controller.requestBack}>
          {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BACK_TO_LIST")}
        </Button>
        <ButtonGroup>
          <Button
            className="h-10"
            disabled={!controller.canSave}
            loading={controller.saving}
            onClick={controller.saveDraft}
          >
            {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_ACTION")}
          </Button>
          <ButtonGroupSeparator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SAVE_OPTIONS")}
                className="size-10"
                size="icon"
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={defaultDisabled}
                onSelect={() => {
                  if (controller.selectedVersion)
                    controller.runVersionCommand("default", controller.selectedVersion.id);
                }}
              >
                <Star className="size-4" />
                {isDefault
                  ? t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_ACTIVE")
                  : t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SET_DEFAULT_ACTION")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
    );
  }

  return (
    <Button onClick={controller.openNewSystemDraft}>
      <Plus data-icon="inline-start" />
      {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION")}
    </Button>
  );
}

function DesignSystemsGrid(props: {
  workspaceId: string;
  controller: WorkspaceDesignSystemsController;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const controller = props.controller;
  return (
    <div className="flex flex-col gap-4">
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
      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_LIST_LABEL")}
      >
        {controller.systems.map((system) => (
          <SystemCard
            key={system.id}
            workspaceId={props.workspaceId}
            system={system}
            onOpen={() => controller.openSystem(system.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SystemCard(props: {
  workspaceId: string;
  system: DesignSystemSummaryOut;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation("settings");
  const manifest = useWorkspaceDesignSystemCardManifest(props.workspaceId, props.system.id);
  const colors = manifest ? previewColors(manifest.primitiveTokens ?? {}) : null;
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    dateStyle: "medium",
  });
  return (
    <button
      type="button"
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={props.onOpen}
    >
      <SystemCardCover colors={colors} name={props.system.name} />
      <span className="flex flex-1 flex-col gap-2.5 p-4">
        <span className="flex items-center gap-2">
          <span className="truncate text-title3 font-semibold text-label-primary">
            {props.system.name}
          </span>
          {props.system.isDefault ? (
            <BaseTag className="ml-auto shrink-0" color="blue">
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DEFAULT_SHORT")}
            </BaseTag>
          ) : null}
        </span>
        <span className="line-clamp-2 min-h-10 text-footnote leading-5 text-label-secondary">
          {props.system.description ?? t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_NO_DESCRIPTION")}
        </span>
        <span className="mt-auto flex items-center justify-between border-t pt-2.5 text-caption text-label-tertiary">
          <span className="tabular-nums">
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_COUNT", {
              count: props.system.versionCount,
            })}
          </span>
          <span className="tabular-nums">
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CARD_UPDATED", {
              date: date.format(new Date(props.system.updatedAt)),
            })}
          </span>
        </span>
      </span>
    </button>
  );
}

function SystemCardCover(props: { colors: PreviewColors | null; name: string }) {
  if (!props.colors) {
    return <Skeleton className="h-40 rounded-none" />;
  }
  const { canvas, ink, action, actionText, border, secondary } = props.colors;
  return (
    <span
      className="relative block h-40 overflow-hidden border-b"
      style={{ backgroundColor: canvas, borderColor: border }}
      aria-hidden="true"
    >
      <span className="absolute inset-x-4 top-4 flex items-center gap-2.5">
        <span
          className="size-5 rounded-md"
          style={{ backgroundColor: action, color: actionText }}
        />
        <span className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: border }} />
        <span className="h-5 w-12 rounded-md" style={{ backgroundColor: ink, color: canvas }} />
      </span>
      <span className="absolute bottom-9 left-4 right-4 flex flex-col gap-2">
        <span className="block h-2.5 w-3/4 rounded-full" style={{ backgroundColor: ink }} />
        <span className="block h-2.5 w-1/2 rounded-full" style={{ backgroundColor: ink }} />
        <span
          className="mt-1 block h-1.5 w-2/3 rounded-full"
          style={{ backgroundColor: secondary }}
        />
        <span className="mt-1.5 flex items-center gap-1.5">
          <span
            className="h-4 w-10 rounded-md"
            style={{ backgroundColor: action, color: actionText }}
          />
          <span className="h-4 w-10 rounded-md border" style={{ borderColor: border }} />
        </span>
      </span>
      <span
        className="absolute right-4 bottom-9 flex size-8 items-center justify-center rounded-lg text-sm font-bold"
        style={{ border: `1px solid ${border}`, color: ink }}
      >
        Aa
      </span>
      <span className="absolute bottom-0 left-0 flex h-3 w-full">
        {[canvas, ink, secondary, action, border].map((color, index) => (
          <span key={index} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </span>
    </span>
  );
}

function DesignSystemDetail({ controller }: { controller: WorkspaceDesignSystemsController }) {
  const { t } = useTranslation(["settings", "common"]);
  const draft = controller.draft;
  const isNew = draft?.isNew ?? false;

  return (
    <section className="flex flex-col gap-7">
      <ContentGuard
        loading={!draft || (!isNew && controller.versionsQuery.isLoading)}
        error={!isNew ? (controller.versionsQuery.error ?? controller.versionQuery.error) : null}
        onRetry={() => {
          void controller.versionsQuery.refetch();
          void controller.versionQuery.refetch();
        }}
        loadingVariant="form"
      >
        <VersionStatusBanner controller={controller} />

        {draft ? (
          <>
            <DesignSystemPreview name={draft.name} values={draft.values} />
            <ColorBoard controller={controller} values={draft.values} />
            <TypographyBoard controller={controller} values={draft.values} />
            <ComponentCatalogBoard controller={controller} values={draft.values} />
            <MotionBoard controller={controller} values={draft.values} />
          </>
        ) : null}
      </ContentGuard>

      <ConfirmDialog
        open={controller.discardTarget !== null}
        title={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DISCARD_CONFIRM_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DISCARD_CONFIRM_DESC")}
        confirmText={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DISCARD_CONFIRM_ACTION")}
        cancelText={t("common:CANCEL")}
        onOpenChange={(open) => {
          if (!open) controller.resolveDiscard(false);
        }}
        onConfirm={() => controller.resolveDiscard(true)}
      />
    </section>
  );
}

function EditableText(props: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(props.value);

  const commit = () => {
    setEditing(false);
    if (buffer.trim() !== props.value.trim()) props.onCommit(buffer);
  };

  if (editing) {
    const shared = {
      autoFocus: true,
      value: buffer,
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setBuffer(event.target.value),
      onBlur: commit,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter" && !props.multiline) commit();
        if (event.key === "Escape") {
          setBuffer(props.value);
          setEditing(false);
        }
      },
      "aria-label": props.ariaLabel,
    };
    return props.multiline ? (
      <Textarea {...shared} />
    ) : (
      <Input {...shared} className="w-full max-w-md text-title2 font-bold" />
    );
  }

  return (
    <button
      type="button"
      title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CLICK_TO_EDIT_HINT")}
      className="group/edit -mx-1 rounded-md px-1 text-left transition-colors duration-100 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => {
        setBuffer(props.value);
        setEditing(true);
      }}
    >
      {props.value || <span className="text-label-tertiary">{props.placeholder}</span>}
      <Pencil
        className="ml-1.5 inline size-3.5 text-label-tertiary opacity-40 transition-opacity group-hover/edit:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}

function VersionStatusBanner(props: { controller: WorkspaceDesignSystemsController }) {
  const { t, i18n } = useTranslation("settings");
  const version = props.controller.selectedVersion;
  const findings = props.controller.latestValidation?.findings ?? [];
  if (!version || version.validationStatus !== "invalid") return null;
  const blockerCount = findings.filter((finding) => finding.severity === "blocker").length;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_INVALID_ALERT_TITLE")}</AlertTitle>
      <AlertDescription>
        {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_INVALID_ALERT_DESC", { count: blockerCount })}
        {findings.length ? (
          <ul className="mt-2 list-disc pl-5">
            {findings.slice(0, 5).map((finding) => (
              <li key={`${finding.code}:${finding.path ?? "root"}`}>
                {localizedFindingMessage(i18n, finding.messageKey)}
              </li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function SectionHeader(props: { id: string; title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h3 id={props.id} className="text-title2 font-bold text-label-primary">
        {props.title}
      </h3>
      <p className="max-w-3xl text-body text-label-secondary">{props.description}</p>
    </div>
  );
}

const COLOR_ROLES = [
  {
    field: "canvasColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CANVAS_COLOR_LABEL",
  },
  {
    field: "primaryTextColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PRIMARY_TEXT_COLOR_LABEL",
  },
  {
    field: "secondaryTextColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SECONDARY_TEXT_COLOR_LABEL",
  },
  {
    field: "actionColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_COLOR_LABEL",
  },
  {
    field: "actionTextColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_TEXT_COLOR_LABEL",
  },
  {
    field: "borderColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BORDER_COLOR_LABEL",
  },
  {
    field: "focusColor",
    labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FOCUS_COLOR_LABEL",
  },
] as const;

function ColorBoard(props: {
  controller: WorkspaceDesignSystemsController;
  values: DesignSystemFoundationValues;
}) {
  const { t } = useTranslation("settings");
  return (
    <section aria-labelledby="design-system-colors-title">
      <SectionHeader
        id="design-system-colors-title"
        title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLORS_TITLE")}
        description={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLORS_EDIT_DESC")}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {COLOR_ROLES.map((role) => (
          <ColorRoleCard
            key={role.field}
            label={t(role.labelKey)}
            value={props.values[role.field]}
            onChange={(value) => props.controller.updateDraftValue(role.field, value)}
          />
        ))}
      </div>
    </section>
  );
}

function ColorRoleCard(props: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation("settings");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/swatch overflow-hidden rounded-xl border bg-card text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLOR_EDIT_LABEL", {
            role: props.label,
          })}
        >
          <span
            className="relative block h-20 border-b ring-1 ring-inset ring-black/10"
            style={{ backgroundColor: props.value, borderColor: props.value }}
          >
            <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-card/80 text-label-secondary opacity-40 transition-opacity group-hover/swatch:opacity-100">
              <Pencil className="size-3.5" aria-hidden="true" />
            </span>
          </span>
          <span className="block px-3 py-2.5">
            <span className="block truncate text-caption font-medium text-label-primary">
              {props.label}
            </span>
            <span className="mt-0.5 block font-mono text-caption uppercase text-label-secondary">
              {props.value}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-0 bg-transparent p-0 shadow-none">
        <ColorPickerContent color={props.value} onChange={props.onChange} ariaLabel={props.label} />
      </PopoverContent>
    </Popover>
  );
}

const FONT_OPTIONS = [
  { value: "sans-serif", labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FONT_GENERIC_SANS" },
  { value: "serif", labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FONT_GENERIC_SERIF" },
  { value: "monospace", labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FONT_GENERIC_MONO" },
  { value: "Inter", label: "Inter" },
  { value: "Figtree", label: "Figtree" },
  { value: "Roboto", label: "Roboto" },
  { value: "PingFang SC", label: "PingFang SC" },
  { value: "Source Han Sans", label: "Source Han Sans" },
] as const;

const SIZE_OPTIONS = ["0.875rem", "1rem", "1.125rem"] as const;
const SIZE_OPTION_LABELS: Record<(typeof SIZE_OPTIONS)[number], string> = {
  "0.875rem": "14 px",
  "1rem": "16 px",
  "1.125rem": "18 px",
};

function TypographyBoard(props: {
  controller: WorkspaceDesignSystemsController;
  values: DesignSystemFoundationValues;
}) {
  const { t } = useTranslation("settings");
  const family = props.values.bodyFont;
  const familyLabel = (option: (typeof FONT_OPTIONS)[number]) =>
    "labelKey" in option ? t(option.labelKey) : option.label;
  return (
    <section aria-labelledby="design-system-typography-title">
      <SectionHeader
        id="design-system-typography-title"
        title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TYPOGRAPHY_TITLE")}
        description={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_TYPOGRAPHY_DESC")}
      />
      <div className="mt-4 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="flex flex-col items-start justify-center gap-3 border-b pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
          <span
            className="text-7xl leading-none font-semibold text-label-primary"
            style={{ fontFamily: family }}
            aria-hidden="true"
          >
            Aa
          </span>
          <div className="flex w-full flex-col gap-2">
            <SelectField
              id="draft-font-family"
              label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BODY_FONT_LABEL")}
              value={family}
              options={FONT_OPTIONS.map((option) => ({
                value: option.value,
                label: familyLabel(option),
              }))}
              onChange={(value) => props.controller.updateDraftValue("bodyFont", value)}
            />
            <SelectField
              id="draft-base-size"
              label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BASE_FONT_SIZE_LABEL")}
              value={props.values.baseFontSize}
              options={SIZE_OPTIONS.map((value) => ({
                value,
                label: SIZE_OPTION_LABELS[value],
              }))}
              onChange={(value) => props.controller.updateDraftValue("baseFontSize", value)}
            />
          </div>
        </div>
        <div className="min-w-0 space-y-4 self-center" style={{ fontFamily: family }}>
          <p className="text-3xl leading-tight font-semibold text-label-primary">
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_HEADING")}
          </p>
          <p
            className="max-w-prose text-label-secondary"
            style={{ fontSize: props.values.baseFontSize, lineHeight: 1.5 }}
          >
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_BODY")}
          </p>
        </div>
      </div>
    </section>
  );
}

const MOTION_DURATION_OPTIONS = ["90ms", "120ms", "180ms", "240ms", "300ms", "420ms"] as const;
const MOTION_REDUCED_OPTIONS = ["0ms", "60ms", "120ms"] as const;

function ComponentCatalogBoard(props: {
  controller: WorkspaceDesignSystemsController;
  values: DesignSystemFoundationValues;
}) {
  const { t } = useTranslation("settings");
  const catalogs = props.controller.componentCatalogsQuery.data ?? [];
  return (
    <section aria-labelledby="design-system-components-title">
      <SectionHeader
        id="design-system-components-title"
        title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENTS_TITLE")}
        description={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENTS_DESC")}
      />
      <div className="mt-4 rounded-xl border bg-card p-5">
        <SelectField
          id="draft-component-catalog"
          label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENT_CATALOG_LABEL")}
          value={props.values.componentCatalogVersion}
          disabled={!catalogs.length}
          options={catalogs.map((catalog) => ({
            value: catalog.catalogVersion,
            label: localizedCatalogName(catalog),
          }))}
          onChange={(value) => props.controller.updateDraftValue("componentCatalogVersion", value)}
        />
      </div>
    </section>
  );
}

function MotionBoard(props: {
  controller: WorkspaceDesignSystemsController;
  values: DesignSystemFoundationValues;
}) {
  const { t } = useTranslation("settings");
  const [playToken, setPlayToken] = useState(0);
  const [reducedPreview, setReducedPreview] = useState(false);
  const easing =
    MOTION_EASING_PRESETS[props.values.motionEasing as keyof typeof MOTION_EASING_PRESETS] ??
    MOTION_EASING_PRESETS.standard;
  const easingCss = `cubic-bezier(${easing.value.join(", ")})`;
  const duration = reducedPreview
    ? props.values.motionReducedDuration
    : props.values.motionDuration;

  return (
    <section aria-labelledby="design-system-motion-title">
      <SectionHeader
        id="design-system-motion-title"
        title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_TITLE")}
        description={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DESC")}
      />
      <style>{`@keyframes ds-motion-slide { from { transform: translateX(0); opacity: 0.25; } to { transform: translateX(calc(100% - 3rem)); opacity: 1; } }
@keyframes ds-motion-fade { from { transform: scale(0.72); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      <div className="mt-4 grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <SelectField
            id="draft-motion-duration"
            label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DURATION_LABEL")}
            value={props.values.motionDuration}
            options={MOTION_DURATION_OPTIONS.map((value) => ({ value, label: value }))}
            onChange={(value) => props.controller.updateDraftValue("motionDuration", value)}
          />
          <SelectField
            id="draft-motion-easing"
            label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_EASING_LABEL")}
            value={props.values.motionEasing}
            options={Object.entries(MOTION_EASING_PRESETS).map(([value, preset]) => ({
              value,
              label: t(preset.labelKey),
            }))}
            onChange={(value) => props.controller.updateDraftValue("motionEasing", value)}
          />
          <SelectField
            id="draft-motion-reduced"
            label={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_REDUCED_LABEL")}
            value={props.values.motionReducedDuration}
            options={MOTION_REDUCED_OPTIONS.map((value) => ({ value, label: value }))}
            onChange={(value) => props.controller.updateDraftValue("motionReducedDuration", value)}
          />
          <p className="mt-1 text-caption leading-relaxed text-label-tertiary">
            {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_PREVIEW_HINT", {
              duration: props.values.motionDuration,
            })}
          </p>
        </div>
        <div className="flex flex-col gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-medium text-label-secondary">
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DEMO_LABEL")}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant={reducedPreview ? "default" : "outline"}
                size="sm"
                aria-pressed={reducedPreview}
                onClick={() => {
                  setReducedPreview((current) => !current);
                  setPlayToken((token) => token + 1);
                }}
              >
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DEMO_REDUCED")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlayToken((token) => token + 1)}
              >
                <Play data-icon="inline-start" />
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DEMO_PLAY")}
              </Button>
            </div>
          </div>
          <EasingCurveChart easing={easing.value} />
          <div className="rounded-lg border border-dashed p-3">
            <div className="flex h-9 items-center overflow-hidden rounded-md bg-muted/50 px-1.5">
              <span
                key={`slide-${playToken}-${duration}-${easingCss}`}
                className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
                style={{
                  animation: `ds-motion-slide ${duration} ${easingCss} 2 alternate both`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex h-14 items-center justify-center overflow-hidden rounded-md bg-muted/50">
              <span
                key={`fade-${playToken}-${duration}-${easingCss}`}
                className="flex h-9 w-24 items-center justify-center rounded-md border bg-card text-caption font-medium text-label-secondary"
                style={{
                  animation: `ds-motion-fade ${duration} ${easingCss} 2 alternate both`,
                }}
                aria-hidden="true"
              >
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_CARD_LABEL")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function EasingCurveChart({ easing }: { easing: readonly number[] }) {
  const [x1, y1, x2, y2] = easing;
  const toY = (value: number) => 40 - value * 40;
  const toX = (value: number) => value * 80;
  return (
    <svg viewBox="-6 -6 92 52" className="h-24 w-full" role="img" aria-label="cubic-bezier curve">
      <line x1="0" y1="-4" x2="0" y2="44" stroke="currentColor" strokeOpacity="0.15" />
      <line x1="-4" y1="40" x2="84" y2="40" stroke="currentColor" strokeOpacity="0.15" />
      <line
        x1="0"
        y1="40"
        x2="80"
        y2="0"
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeDasharray="3 3"
      />
      <path
        d={`M 0 ${toY(0)} C ${toX(x1)} ${toY(y1)}, ${toX(x2)} ${toY(y2)}, ${toX(1)} ${toY(1)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
      />
      <circle cx={toX(x1)} cy={toY(y1)} r="2.5" className="fill-primary" />
      <circle cx={toX(x2)} cy={toY(y2)} r="2.5" className="fill-primary" />
    </svg>
  );
}

function SelectField(props: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const known = props.options.some((option) => option.value === props.value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.id} className="text-caption font-medium text-label-secondary">
        {props.label}
      </label>
      <Select
        value={props.value}
        disabled={props.disabled}
        onValueChange={(value) => props.onChange(value)}
      >
        <SelectTrigger id={props.id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {known ? null : <SelectItem value={props.value}>{props.value}</SelectItem>}
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function localizedCatalogName(catalog: ComponentCatalogV1): string {
  const locale = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en-US";
  return catalog.nameByLocale[locale] ?? catalog.nameByLocale["en-US"] ?? catalog.catalogVersion;
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

function DesignSystemPreview(props: { name: string; values: DesignSystemFoundationValues }) {
  const { t } = useTranslation("settings");
  const colors = previewColorsFromValues(props.values);
  const font = props.values.bodyFont;
  const displayName = props.name || t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_UNTITLED");
  return (
    <section aria-labelledby="design-system-preview-title">
      <SectionHeader
        id="design-system-preview-title"
        title={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_TITLE")}
        description={t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_DESC")}
      />
      <div
        className="mt-4 overflow-hidden rounded-xl border shadow-xs"
        style={{ backgroundColor: colors.canvas, color: colors.ink, fontFamily: font }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-3.5"
          style={{ borderColor: colors.border }}
        >
          <span className="flex items-center gap-2.5">
            <span
              className="flex size-6 items-center justify-center rounded-md text-xs font-bold"
              style={{ backgroundColor: colors.action, color: colors.actionText }}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-sm font-bold tracking-tight">{displayName}</span>
          </span>
          <span className="flex items-center gap-5 text-xs" style={{ color: colors.secondary }}>
            <span className="border-b-2 pb-0.5" style={{ borderColor: colors.action }}>
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_NAV")}
            </span>
            <span>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_SECONDARY_NAV")}</span>
          </span>
        </div>
        <div className="grid gap-8 px-6 py-9 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0">
            <p className="max-w-xl text-3xl leading-tight font-bold tracking-tight">
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_HEADING")}
            </p>
            <p className="mt-4 max-w-md text-sm leading-6" style={{ color: colors.secondary }}>
              {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_BODY")}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span
                className="rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm"
                style={{ backgroundColor: colors.action, color: colors.actionText }}
              >
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_ACTION")}
              </span>
              <span
                className="rounded-lg border px-5 py-2.5 text-sm font-semibold"
                style={{ borderColor: colors.border }}
              >
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_SECONDARY_ACTION")}
              </span>
            </div>
            <div
              className="mt-6 flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
              style={{ borderColor: colors.border }}
            >
              <span
                className="size-4 rounded-full border"
                style={{ borderColor: colors.border }}
                aria-hidden="true"
              />
              <span
                className="h-2 flex-1 rounded-full"
                style={{ backgroundColor: colors.border }}
                aria-hidden="true"
              />
              <span
                className="rounded-md px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: colors.action, color: colors.actionText }}
              >
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_ACTION")}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: colors.border }}>
              <p className="text-xs font-medium" style={{ color: colors.secondary }}>
                {t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PREVIEW_CARD_LABEL")}
              </p>
              <p className="mt-2 text-2xl font-bold">24</p>
              <div className="mt-4 h-2 rounded-full" style={{ backgroundColor: colors.border }}>
                <div
                  className="h-full w-2/3 rounded-full"
                  style={{ backgroundColor: colors.action }}
                />
              </div>
            </div>
            <div className="flex gap-3">
              {["Aa", "Bb"].map((glyph) => (
                <div
                  key={glyph}
                  className="flex h-16 flex-1 items-center justify-center rounded-xl border text-xl font-bold"
                  style={{ borderColor: colors.border, color: colors.secondary }}
                >
                  {glyph}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex h-3">
          {colors.palette.map((entry) => (
            <span
              key={entry.labelKey}
              className="flex-1"
              style={{ backgroundColor: entry.value }}
              title={entry.value}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type PreviewColors = ReturnType<typeof previewColorsFromValues>;

function previewColorsFromValues(values: DesignSystemFoundationValues) {
  const palette = [
    { labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CANVAS_COLOR_LABEL", value: values.canvasColor },
    {
      labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PRIMARY_TEXT_COLOR_LABEL",
      value: values.primaryTextColor,
    },
    {
      labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_COLOR_LABEL",
      value: values.actionColor,
    },
    {
      labelKey: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BORDER_COLOR_LABEL",
      value: values.borderColor,
    },
  ];
  return {
    canvas: values.canvasColor,
    ink: values.primaryTextColor,
    action: values.actionColor,
    border: values.borderColor,
    secondary: values.secondaryTextColor,
    actionText: values.actionTextColor,
    palette,
  };
}

function previewColors(tokens: Record<string, { value?: unknown }>) {
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

function tokenString(tokens: Record<string, { value?: unknown }>, path: string, fallback: string) {
  return typeof tokens[path]?.value === "string" ? tokens[path].value : fallback;
}
