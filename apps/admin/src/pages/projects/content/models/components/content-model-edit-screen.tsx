import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ColumnDef, type Table as ReactTable } from "@tanstack/react-table";
import {
  ArrowLeft,
  Blocks,
  Binary,
  Braces,
  CalendarClock,
  Copy,
  FileText,
  Hash,
  ImagePlus,
  Link2,
  ListChecks,
  MapPinned,
  MoreVertical,
  Pencil,
  PlusIcon,
  Save,
  TextCursorInput,
  ToggleLeft,
  Type,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { addContentModelField, deleteContentModelField, listAllContentModels } from "@/api/content";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { BaseTag } from "@/components/ui/tags";
import { copyToClipboard } from "@/lib/clipboard";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { projectContentModelsEditPath } from "@/lib/routing/project-content-routing";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { cn } from "@arclayer/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@arclayer/ui/alert-dialog";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
import {
  DataTableToolbarTools,
  useDataTableCore,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

import {
  buildContentModelFieldPayload,
  CONTENT_MODEL_FIELD_TYPE_GROUPS,
  createContentModelFieldDraft,
  getContentModelFieldTypeGroupDescriptionKey,
  getContentModelFieldTypeGroupLabelKey,
  getContentModelFieldTypeDescriptionKey,
  getContentModelFieldTypeFromRow,
  getContentModelFieldTypeLabelKey,
  isContentModelFieldLocalized,
  readContentModelFieldRows,
  syncContentModelFieldDraftName,
  updateContentModelFieldDraftKey,
  type ContentModelFieldDraft,
  type ContentModelFieldRow,
  type ContentModelFieldTypeId,
} from "../fields";
import type { ContentModelsTableRow } from "../types";
import { validateContentTypeIdentifier } from "../utils";
import { ContentModelsRowActions } from "./content-models-row-actions";

const FIELD_TYPE_ICON_MAP: Record<
  ContentModelFieldTypeId,
  React.ComponentType<{ className?: string }>
> = {
  rich_text: TextCursorInput,
  short_text: Type,
  markdown: FileText,
  slug: Hash,
  number: Binary,
  enumeration: ListChecks,
  date_time: CalendarClock,
  media: ImagePlus,
  location: MapPinned,
  boolean: ToggleLeft,
  json_object: Braces,
  reference: Link2,
  component: Blocks,
};

type ContentModelEditScreenProps = {
  projectId: string;
  model: ContentModelsTableRow | null;
  canManageModels?: boolean;
  pending?: boolean;
  onDuplicate: (model: ContentModelsTableRow) => void;
  onDelete: (model: ContentModelsTableRow) => void;
  onModelChange: (model: ContentModelsTableRow) => void;
  onRefreshModels: () => Promise<void> | void;
  onClose: () => void;
};

type FieldDraftErrors = Partial<
  Record<"name" | "key" | "numberMin" | "numberMax" | "referenceTargetModelKey", string>
>;

function ChoiceButtonGroup<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "flex items-center justify-center rounded-md border px-3 py-2 text-footnote font-medium transition-colors",
            props.value === option.value
              ? "border-primary bg-primary/8 text-label-primary"
              : "border-border/70 bg-background text-label-secondary hover:bg-accent/40 hover:text-label-primary",
          )}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FieldTypePickerDialog(props: {
  open: boolean;
  canManageFields: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (typeId: ContentModelFieldTypeId) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("CONTENT_MODELS_FIELD_TYPE_PICKER_TITLE")}
      contentClassName="sm:max-w-6xl"
      bodyClassName="py-6"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CONTENT_MODEL_FIELD_TYPE_GROUPS.map((group) => (
          <section key={group.id} className="flex min-h-0 flex-col gap-3">
            <div>
              <h3 className="text-headline text-label-primary">
                {t(getContentModelFieldTypeGroupLabelKey(group.id))}
              </h3>
              <p className="mt-1 text-callout text-label-secondary">
                {t(getContentModelFieldTypeGroupDescriptionKey(group.id))}
              </p>
            </div>

            <div className="flex min-h-0 flex-col gap-2">
              {group.typeIds.map((typeId) => {
                const Icon = FIELD_TYPE_ICON_MAP[typeId];
                return (
                  <button
                    key={typeId}
                    type="button"
                    aria-label={t(getContentModelFieldTypeLabelKey(typeId))}
                    disabled={!props.canManageFields}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border border-border/70 bg-background px-4 py-3 text-left transition-colors",
                      "hover:border-border hover:bg-accent/45",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                    onClick={() => props.onSelect(typeId)}
                  >
                    <Icon className="mt-0.5 size-4.5 shrink-0 text-label-primary" />
                    <div className="min-w-0">
                      <div className="text-headline text-label-primary">
                        {t(getContentModelFieldTypeLabelKey(typeId))}
                      </div>
                      <div className="mt-1 text-callout text-label-secondary">
                        {t(getContentModelFieldTypeDescriptionKey(typeId))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </SettingDialog>
  );
}

function FieldConfigDialog(props: {
  open: boolean;
  draft: ContentModelFieldDraft;
  errors: FieldDraftErrors;
  pending: boolean;
  referenceOptions: ContentModelsTableRow[];
  referenceLoading: boolean;
  canManageFields: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (updater: (draft: ContentModelFieldDraft) => ContentModelFieldDraft) => void;
  onChangeType: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation("content");
  const typeLabel = t(getContentModelFieldTypeLabelKey(props.draft.typeId));

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={typeLabel}
      description={t(getContentModelFieldTypeDescriptionKey(props.draft.typeId))}
      contentClassName="sm:max-w-3xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" disabled={props.pending} onClick={props.onChangeType}>
            {t("CONTENT_MODELS_FIELD_CONFIG_CHANGE_TYPE")}
          </Button>
          <div className="flex items-center sm:justify-end">
            <Button
              loading={props.pending}
              disabled={!props.canManageFields}
              onClick={props.onSubmit}
            >
              {t("CONTENT_MODELS_FIELD_CONFIG_SUBMIT")}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="py-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL")}
            error={props.errors.name}
          >
            <Input
              aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL")}
              value={props.draft.name}
              disabled={props.pending}
              placeholder={t("CONTENT_MODELS_FIELD_CONFIG_NAME_PLACEHOLDER")}
              onChange={(event) =>
                props.onDraftChange((draft) =>
                  syncContentModelFieldDraftName(draft, event.target.value),
                )
              }
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")}
            error={props.errors.key}
          >
            <Input
              aria-label={t("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")}
              value={props.draft.key.value}
              disabled={props.pending}
              placeholder={t("CONTENT_MODELS_FIELD_CONFIG_KEY_PLACEHOLDER")}
              onChange={(event) =>
                props.onDraftChange((draft) =>
                  updateContentModelFieldDraftKey(draft, event.target.value),
                )
              }
            />
          </SettingDialogField>

          <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_OPTIONAL_LABEL")}>
            <Textarea
              aria-label={t("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_OPTIONAL_LABEL")}
              value={props.draft.description}
              disabled={props.pending}
              rows={3}
              placeholder={t("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_PLACEHOLDER")}
              onChange={(event) =>
                props.onDraftChange((draft) => ({ ...draft, description: event.target.value }))
              }
            />
          </SettingDialogField>

          {props.draft.typeId === "number" ? (
            <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_FORMAT_LABEL")}>
              <ChoiceButtonGroup
                value={props.draft.numberFormat}
                options={[
                  {
                    value: "integer",
                    label: t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_FORMAT_INTEGER"),
                  },
                  {
                    value: "decimal",
                    label: t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_FORMAT_DECIMAL"),
                  },
                ]}
                onChange={(value) =>
                  props.onDraftChange((draft) => ({ ...draft, numberFormat: value }))
                }
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL")}
                  placeholder={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL")}
                  value={props.draft.numberMin}
                  onChange={(event) =>
                    props.onDraftChange((draft) => ({ ...draft, numberMin: event.target.value }))
                  }
                />
                <Input
                  aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL")}
                  placeholder={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL")}
                  value={props.draft.numberMax}
                  onChange={(event) =>
                    props.onDraftChange((draft) => ({ ...draft, numberMax: event.target.value }))
                  }
                />
              </div>
            </SettingDialogField>
          ) : null}

          {props.draft.typeId === "media" ? (
            <>
              <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_MODE_LABEL")}>
                <ChoiceButtonGroup
                  value={props.draft.mediaMode}
                  options={[
                    {
                      value: "single",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_MODE_SINGLE"),
                    },
                    {
                      value: "multiple",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_MODE_MULTIPLE"),
                    },
                  ]}
                  onChange={(value) =>
                    props.onDraftChange((draft) => ({ ...draft, mediaMode: value }))
                  }
                />
              </SettingDialogField>
              <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_LABEL")}>
                <ChoiceButtonGroup
                  value={props.draft.mediaKind}
                  options={[
                    {
                      value: "image",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_IMAGE"),
                    },
                    {
                      value: "video",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_VIDEO"),
                    },
                    {
                      value: "file",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_MEDIA_KIND_FILE"),
                    },
                  ]}
                  onChange={(value) =>
                    props.onDraftChange((draft) => ({ ...draft, mediaKind: value }))
                  }
                />
              </SettingDialogField>
            </>
          ) : null}

          {props.draft.typeId === "boolean" ? (
            <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_LABEL")}>
              <ChoiceButtonGroup
                value={props.draft.booleanDefault}
                options={[
                  {
                    value: "none",
                    label: t("CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_NONE"),
                  },
                  {
                    value: "true",
                    label: t("CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_TRUE"),
                  },
                  {
                    value: "false",
                    label: t("CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_FALSE"),
                  },
                ]}
                onChange={(value) =>
                  props.onDraftChange((draft) => ({ ...draft, booleanDefault: value }))
                }
              />
            </SettingDialogField>
          ) : null}

          {props.draft.typeId === "reference" ? (
            <>
              <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_MODE_LABEL")}>
                <ChoiceButtonGroup
                  value={props.draft.referenceMode}
                  options={[
                    {
                      value: "single",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_MODE_SINGLE"),
                    },
                    {
                      value: "multiple",
                      label: t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_MODE_MULTIPLE"),
                    },
                  ]}
                  onChange={(value) =>
                    props.onDraftChange((draft) => ({ ...draft, referenceMode: value }))
                  }
                />
              </SettingDialogField>
              <SettingDialogField
                title={t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL")}
                error={props.errors.referenceTargetModelKey}
              >
                <select
                  aria-label={t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_LABEL")}
                  className="flex h-9 w-full rounded-md border border-border/70 bg-background px-3 text-footnote text-label-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"
                  disabled={props.pending || props.referenceLoading}
                  value={props.draft.referenceTargetModelKey}
                  onChange={(event) =>
                    props.onDraftChange((draft) => ({
                      ...draft,
                      referenceTargetModelKey: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_PLACEHOLDER")}
                  </option>
                  {props.referenceOptions.map((model) => (
                    <option key={model.id} value={model.singularKey}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </SettingDialogField>
            </>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 py-3">
              <Checkbox
                checked={props.draft.required}
                onCheckedChange={(checked) =>
                  props.onDraftChange((draft) => ({ ...draft, required: Boolean(checked) }))
                }
              />
              <div className="min-w-0">
                <div className="text-headline text-label-primary">
                  {t("CONTENT_MODELS_FIELD_CONFIG_REQUIRED_LABEL")}
                </div>
                <div className="mt-1 text-callout text-label-secondary">
                  {t("CONTENT_MODELS_FIELD_CONFIG_REQUIRED_DESC")}
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 py-3">
              <Checkbox
                checked={props.draft.localizable}
                onCheckedChange={(checked) =>
                  props.onDraftChange((draft) => ({ ...draft, localizable: Boolean(checked) }))
                }
              />
              <div className="min-w-0">
                <div className="text-headline text-label-primary">
                  {t("CONTENT_MODELS_FIELD_CONFIG_LOCALIZED_LABEL")}
                </div>
                <div className="mt-1 text-callout text-label-secondary">
                  {t("CONTENT_MODELS_FIELD_CONFIG_LOCALIZED_DESC")}
                </div>
              </div>
            </label>
          </div>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function FieldDeleteDialog(props: {
  field: ContentModelFieldRow | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("content");

  return (
    <AlertDialog open={Boolean(props.field)} onOpenChange={(open) => props.onOpenChange(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("CONTENT_MODELS_FIELD_DELETE_DIALOG_TITLE")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("CONTENT_MODELS_FIELD_DELETE_DIALOG_DESC", {
              name: props.field?.label ?? "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>
            {t("CONTENT_MODELS_CANCEL_ACTION")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={props.pending}
            onClick={(event) => {
              event.preventDefault();
              props.onConfirm();
            }}
          >
            {t("CONTENT_MODELS_FIELD_DELETE_DIALOG_CONFIRM")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FieldRowMenu(props: { disabled?: boolean; onDelete: () => void }) {
  const { t } = useTranslation(["content", "common"]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common:MORE")}
          disabled={props.disabled}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuIconItem
          icon={<X className="size-4" />}
          variant="destructive"
          disabled={props.disabled}
          onSelect={props.onDelete}
        >
          {t("common:DELETE")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldsTable(props: {
  tableId: string;
  rows: ContentModelFieldRow[];
  canManageFields: boolean;
  pending: boolean;
  refreshing: boolean;
  onAddField: () => void;
  onEditField: (row: ContentModelFieldRow) => void;
  onDeleteField: (row: ContentModelFieldRow) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [searchInput, setSearchInput] = React.useState("");
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({ tableId: props.tableId });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: props.tableId,
  });
  const filteredRows = React.useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    if (!query) return props.rows;
    return props.rows.filter((row) => {
      const typeId = getContentModelFieldTypeFromRow(row);
      const typeLabel = t(getContentModelFieldTypeLabelKey(typeId)).toLowerCase();
      return [row.label, row.key, typeLabel].some((value) => value.toLowerCase().includes(query));
    });
  }, [props.rows, searchInput, t]);
  const columns = React.useMemo<ColumnDef<ContentModelFieldRow, unknown>[]>(
    () => [
      {
        accessorKey: "label",
        meta: {
          title: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_NAME"),
          kind: "primary",
          pin: "left",
        },
        header: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_NAME"),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-headline text-label-primary">
              {row.original.label}
            </span>
            <BaseTag textStyle="caption" className="shrink-0">
              <span className="font-mono">{row.original.key}</span>
            </BaseTag>
          </div>
        ),
        size: 360,
        minSize: 280,
      },
      {
        id: "fieldType",
        accessorFn: getContentModelFieldTypeFromRow,
        meta: {
          title: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_TYPE"),
          kind: "meta",
        },
        header: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_TYPE"),
        cell: ({ row }) => {
          const typeId = getContentModelFieldTypeFromRow(row.original);
          return (
            <BaseTag color="blue" textStyle="caption">
              {t(getContentModelFieldTypeLabelKey(typeId))}
            </BaseTag>
          );
        },
        size: 180,
        minSize: 150,
      },
      {
        id: "localization",
        accessorFn: isContentModelFieldLocalized,
        meta: {
          title: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_LOCALIZATION"),
          kind: "meta",
        },
        header: t("content:CONTENT_MODELS_FIELDS_TABLE_COL_LOCALIZATION"),
        cell: () => null,
        size: 160,
        minSize: 140,
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        meta: buildDataTableActionsColumnMeta("right", "right"),
        header: "",
        cell: ({ row }) => (
          <DataTableActionsCell>
            <Button
              variant="ghost"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onEditField(row.original)}
            >
              <Pencil className="size-4" />
              {t("content:CONTENT_MODELS_FIELD_ROW_EDIT_ACTION")}
            </Button>
            <FieldRowMenu
              disabled={props.pending}
              onDelete={() => props.onDeleteField(row.original)}
            />
          </DataTableActionsCell>
        ),
        size: 132,
        minSize: 132,
      },
    ],
    [props, t],
  );
  const tableCore = useDataTableCore<ContentModelFieldRow>({
    columns,
    data: filteredRows,
    pageCount: 1,
    initialState: {
      pageSize: 500,
    },
    rowSelection: {
      enabled: false,
      getRowId: (row) => row.key,
    },
    features: {
      sorting: { enabled: true, mode: "client" },
    },
  });
  const toolsLabels = React.useMemo(() => buildDataTableToolsLabels(t), [t]);
  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DataTableSearchInput
        value={searchInput}
        onChange={setSearchInput}
        placeholder={t("content:CONTENT_MODELS_FIELDS_SEARCH_PLACEHOLDER")}
        clearLabel={t("common:CLEAR")}
      />
      <DataTableToolbarTools
        table={tableCore.table as ReactTable<ContentModelFieldRow>}
        rowHeight={rowHeight}
        onRowHeightChange={setRowHeight}
        wrapHeaders={wrapHeaders}
        onWrapHeadersChange={setWrapHeaders}
        onRefresh={props.onRefresh}
        refreshing={props.refreshing}
        labels={toolsLabels}
        components={{ IconButton: DataTableToolbarAntdIconButton }}
      />
    </div>
  );
  const footerSlot = (
    <div className="flex w-full justify-center">
      <Button
        variant="outline"
        onClick={props.onAddField}
        disabled={!props.canManageFields || props.pending}
      >
        <PlusIcon className="size-4" />
        {t("content:CONTENT_MODELS_FIELDS_ADD_ACTION")}
      </Button>
    </div>
  );

  return (
    <AdminDataTableSection
      table={tableCore.table}
      emptyText={t("content:CONTENT_MODELS_FIELDS_TABLE_EMPTY_TEXT")}
      emptyTitle={t("content:CONTENT_MODELS_FIELDS_TABLE_EMPTY_TITLE")}
      emptyDescription={t("content:CONTENT_MODELS_FIELDS_TABLE_EMPTY_DESC")}
      loading={false}
      error={null}
      onRetry={props.onRefresh}
      t={t}
      rowHeight={rowHeight}
      wrapHeaders={wrapHeaders}
      refreshing={props.refreshing}
      toolbar={toolbar}
      footerSlot={footerSlot}
    />
  );
}

export function ContentModelEditScreen(props: ContentModelEditScreenProps) {
  const { t } = useTranslation(["content", "common"]);
  const activeModel = props.model;
  const canManageFields = props.canManageModels !== false;
  const fieldRows = React.useMemo(
    () => (activeModel ? readContentModelFieldRows(activeModel) : []),
    [activeModel],
  );
  const [typePickerOpen, setTypePickerOpen] = React.useState(false);
  const [configDialogOpen, setConfigDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ContentModelFieldDraft>(
    createContentModelFieldDraft("short_text"),
  );
  const [draftErrors, setDraftErrors] = React.useState<FieldDraftErrors>({});
  const [fieldToDelete, setFieldToDelete] = React.useState<ContentModelFieldRow | null>(null);
  const [fieldsRefreshing, setFieldsRefreshing] = React.useState(false);
  const tableId = React.useMemo(
    () => `project-content-model-fields:${props.projectId}:${activeModel?.id ?? "none"}`,
    [activeModel?.id, props.projectId],
  );

  React.useEffect(() => {
    if (!activeModel) {
      setTypePickerOpen(false);
      setConfigDialogOpen(false);
      setDraft(createContentModelFieldDraft("short_text"));
      setDraftErrors({});
      setFieldToDelete(null);
      setFieldsRefreshing(false);
    }
  }, [activeModel]);

  const referenceModelsQuery = useQuery({
    queryKey: ["content", "models", "all", props.projectId],
    queryFn: () => listAllContentModels(props.projectId),
    enabled: configDialogOpen && draft.typeId === "reference",
    staleTime: 60_000,
  });

  const referenceOptions = React.useMemo(
    () => (referenceModelsQuery.data ?? []).filter((model) => model.id !== activeModel?.id),
    [activeModel?.id, referenceModelsQuery.data],
  );

  const handleCopyId = React.useCallback(async () => {
    if (!activeModel) return;
    try {
      await copyToClipboard(activeModel.id);
      notifySuccessText(t("CONTENT_MODELS_ID_COPIED"));
    } catch {
      notifyErrorText(t("CONTENT_MODELS_ID_COPY_FAILED"));
    }
  }, [activeModel, t]);

  const syncModel = React.useCallback(
    async (nextModel: ContentModelsTableRow) => {
      props.onModelChange(nextModel);
      await props.onRefreshModels();
    },
    [props],
  );

  const addFieldMutation = useMutation({
    mutationFn: async () => {
      if (!activeModel) throw new Error("CONTENT_MODELS_ACTIVE_MODEL_REQUIRED");
      return addContentModelField(
        props.projectId,
        activeModel.id,
        buildContentModelFieldPayload(draft),
      );
    },
    onSuccess: async (model) => {
      await syncModel(model);
      setConfigDialogOpen(false);
      setTypePickerOpen(false);
      setDraft(createContentModelFieldDraft("short_text"));
      setDraftErrors({});
      notifySuccessText(t("CONTENT_MODELS_FIELD_CREATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (fieldKey: string) => {
      if (!activeModel) throw new Error("CONTENT_MODELS_ACTIVE_MODEL_REQUIRED");
      return deleteContentModelField(props.projectId, activeModel.id, fieldKey);
    },
    onSuccess: async (model) => {
      await syncModel(model);
      setFieldToDelete(null);
      notifySuccessText(t("CONTENT_MODELS_FIELD_DELETE_SUCCESS"));
    },
    onError: notifyError,
  });

  const validateDraft = React.useCallback((): FieldDraftErrors => {
    const errors: FieldDraftErrors = {};
    const name = draft.name.trim();
    const key = draft.key.value.trim();
    const existingKeys = new Set(fieldRows.map((row) => row.key));

    if (!name) {
      errors.name = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_NAME");
    }
    if (!key) {
      errors.key = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_KEY");
    } else if (!validateContentTypeIdentifier(key)) {
      errors.key = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_KEY_FORMAT");
    } else if (existingKeys.has(key)) {
      errors.key = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_KEY_EXISTS");
    }
    if (draft.typeId === "reference" && !draft.referenceTargetModelKey.trim()) {
      errors.referenceTargetModelKey = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_REFERENCE_TARGET");
    }

    if (draft.typeId === "number") {
      const min = draft.numberMin.trim();
      const max = draft.numberMax.trim();
      if (min && Number.isNaN(Number(min))) {
        errors.numberMin = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_NUMBER");
      }
      if (max && Number.isNaN(Number(max))) {
        errors.numberMax = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_NUMBER");
      }
      if (!errors.numberMin && !errors.numberMax && min && max && Number(min) > Number(max)) {
        errors.numberMax = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_NUMBER_RANGE");
      }
    }

    return errors;
  }, [draft, fieldRows, t]);

  const handleOpenAddField = React.useCallback(() => {
    setTypePickerOpen(true);
  }, []);

  const handleSelectType = React.useCallback((typeId: ContentModelFieldTypeId) => {
    setDraft((current) => createContentModelFieldDraft(typeId, current));
    setDraftErrors({});
    setTypePickerOpen(false);
    setConfigDialogOpen(true);
  }, []);

  const handleSubmitDraft = React.useCallback(() => {
    const errors = validateDraft();
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void addFieldMutation.mutateAsync();
  }, [addFieldMutation, validateDraft]);

  const handleRefreshFields = React.useCallback(async () => {
    setFieldsRefreshing(true);
    try {
      await props.onRefreshModels();
    } catch (error) {
      notifyError(error);
    } finally {
      setFieldsRefreshing(false);
    }
  }, [props]);

  const pending =
    props.pending ||
    addFieldMutation.isPending ||
    deleteFieldMutation.isPending ||
    fieldsRefreshing;

  if (!activeModel) return null;

  const copyIdAction = (
    <Button variant="ghost" size="sm" onClick={() => void handleCopyId()} disabled={pending}>
      <Copy className="size-4" />
      {t("CONTENT_MODELS_COPY_ID_ACTION")}
    </Button>
  );

  const headerAction = (
    <div className="inline-flex items-center gap-2">
      <ContentModelsRowActions
        row={activeModel}
        canManageModels={props.canManageModels}
        pending={pending}
        triggerVariant="outline"
        onDuplicate={props.onDuplicate}
        onDelete={props.onDelete}
      />
      <Button variant="outline" onClick={props.onClose} disabled={pending}>
        <ArrowLeft className="size-4" />
        {t("CONTENT_MODELS_EDIT_BACK_ACTION")}
      </Button>
      {fieldRows.length > 0 ? (
        <Button variant="primary" disabled>
          <Save className="size-4" />
          {t("CONTENT_MODELS_EDIT_SAVE_ACTION")}
        </Button>
      ) : null}
    </div>
  );
  const pageDescription = activeModel.description?.trim() || undefined;
  const pageExtra =
    fieldRows.length > 0 ? (
      <ChromeTabsList className="w-auto">
        <ChromeTabsTrigger value="fields">{t("CONTENT_MODELS_EDIT_TAB_FIELDS")}</ChromeTabsTrigger>
        <ChromeTabsTrigger value="settings">
          {t("CONTENT_MODELS_EDIT_TAB_SETTINGS")}
        </ChromeTabsTrigger>
      </ChromeTabsList>
    ) : undefined;

  return (
    <ChromeTabs value="fields">
      <DefaultPage
        title={activeModel.name}
        description={pageDescription}
        showFavoriteToggle
        favoritePath={projectContentModelsEditPath(props.projectId, activeModel.id)}
        afterFavorite={copyIdAction}
        action={headerAction}
        extra={pageExtra}
      >
        {fieldRows.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <ContentGuard
              loading={false}
              empty
              variant="compact"
              wrapperSpacing="flush"
              className="flex w-full items-center justify-center py-0"
              emptyTitle={t("CONTENT_MODELS_FIELDS_EMPTY_TITLE")}
              emptyDescription={t("CONTENT_MODELS_FIELDS_EMPTY_DESC")}
              emptyExtra={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Button onClick={handleOpenAddField} disabled={!canManageFields || pending}>
                    <PlusIcon className="size-4" />
                    {t("CONTENT_MODELS_FIELDS_EMPTY_ACTION")}
                  </Button>
                  <Button variant="outline" onClick={props.onClose} disabled={pending}>
                    {t("CONTENT_MODELS_FIELDS_EMPTY_SECONDARY_ACTION")}
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <ChromeTabsContent value="fields" className="min-h-0 flex-1 pb-8">
            <div className="mx-auto flex min-h-full w-full flex-col">
              <FieldsTable
                tableId={tableId}
                rows={fieldRows}
                canManageFields={canManageFields}
                pending={pending}
                refreshing={fieldsRefreshing}
                onAddField={handleOpenAddField}
                onEditField={() => notifyInfoText(t("CONTENT_MODELS_FIELD_EDIT_UNAVAILABLE"))}
                onDeleteField={setFieldToDelete}
                onRefresh={() => void handleRefreshFields()}
              />
            </div>
          </ChromeTabsContent>
        )}

        <FieldTypePickerDialog
          open={typePickerOpen}
          canManageFields={canManageFields}
          onOpenChange={setTypePickerOpen}
          onSelect={handleSelectType}
        />
        <FieldConfigDialog
          open={configDialogOpen}
          draft={draft}
          errors={draftErrors}
          pending={addFieldMutation.isPending}
          referenceOptions={referenceOptions}
          referenceLoading={referenceModelsQuery.isLoading}
          canManageFields={canManageFields}
          onOpenChange={setConfigDialogOpen}
          onDraftChange={(updater) => {
            setDraft((current) => updater(current));
            setDraftErrors({});
          }}
          onChangeType={() => {
            setConfigDialogOpen(false);
            setTypePickerOpen(true);
          }}
          onSubmit={handleSubmitDraft}
        />
        <FieldDeleteDialog
          field={fieldToDelete}
          pending={deleteFieldMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setFieldToDelete(null);
          }}
          onConfirm={() => {
            if (!fieldToDelete) return;
            void deleteFieldMutation.mutateAsync(fieldToDelete.key);
          }}
        />
      </DefaultPage>
    </ChromeTabs>
  );
}
