import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeft,
  AtSign,
  Blocks,
  Binary,
  Braces,
  CalendarDays,
  CalendarClock,
  Clock,
  Copy,
  EyeOff,
  FileText,
  GripVertical,
  Hash,
  ImagePlus,
  Infinity as InfinityIcon,
  KeyRound,
  Link2,
  ListChecks,
  LayoutGrid,
  MapPinned,
  MoreVertical,
  Pencil,
  PlusIcon,
  Puzzle,
  RefreshCw,
  Settings2,
  ShieldOff,
  Sigma,
  TextCursorInput,
  ToggleLeft,
  Type,
  type LucideIcon,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  addContentModelField,
  buildContentModelFieldTypesQueryKey,
  deleteContentModelField,
  getContentModelFieldTypeRegistry,
  listAllContentModels,
  reorderContentModelFields,
  type AdminContentModelFieldTypeDefinition,
  type AdminContentModelFieldTypeRegistry,
  updateContentModelField,
} from "@/api/content";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { AdminSiderNav } from "@/components/layout/admin-side-nav/admin-sider-nav";
import {
  ContentModelFieldKeyTag,
  ContentModelFieldTypeTag,
  SelectedCountTag,
} from "@/components/ui/tags";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifyErrorText, notifySuccessText } from "@/lib/notifications";
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
import { SidebarProvider } from "@arclayer/ui/sidebar";
import { Textarea } from "@arclayer/ui/textarea";
import type { JsonValueInput } from "@arclayer/openapi/admin-types";
import type { AdminNavItem } from "@/types/admin-nav";
import {
  useDataTableCore,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";
import { Highlight } from "@arclayer/ui/highlight";

import {
  buildContentModelFieldPayload,
  CONTENT_MODEL_FIELD_TYPE_GROUPS,
  createContentModelFieldDraftFromRow,
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
import { ContentModelSettingsTab } from "./content-model-settings-tab";

const FIELD_TYPE_ICON_MAP: Record<ContentModelFieldTypeId, LucideIcon> = {
  rich_text: TextCursorInput,
  short_text: Type,
  markdown: FileText,
  slug: Hash,
  email: AtSign,
  password: KeyRound,
  number: Binary,
  decimal: Sigma,
  biginteger: InfinityIcon,
  enumeration: ListChecks,
  date_time: CalendarClock,
  time: Clock,
  date: CalendarDays,
  media: ImagePlus,
  location: MapPinned,
  boolean: ToggleLeft,
  json_object: Braces,
  reference: Link2,
  component: Blocks,
  dynamic_zone: Blocks,
  blocks: LayoutGrid,
  custom: Puzzle,
};

type ContentModelEditScreenProps = {
  projectId: string;
  model: ContentModelsTableRow | null;
  section?: ContentModelEditSectionKey;
  canManageModels?: boolean;
  pending?: boolean;
  onDuplicate: (model: ContentModelsTableRow) => void;
  onDelete: (model: ContentModelsTableRow) => void;
  onModelChange: (model: ContentModelsTableRow) => void;
  onRefreshModels: () => Promise<void> | void;
  onClose: () => void;
};

type ContentModelEditSectionKey = "fields" | "settings";
type FieldConfigSectionKey = "basic" | "advanced";

type FieldDraftErrors = Partial<
  Record<
    | "name"
    | "key"
    | "numberMin"
    | "numberMax"
    | "minLength"
    | "maxLength"
    | "regexPattern"
    | "referenceTargetModelKey"
    | "componentTargetModelKey"
    | "dynamicZoneComponentKeys"
    | "dynamicZoneMin"
    | "dynamicZoneMax",
    string
  >
>;

function ContentModelEditSectionMenu(props: {
  projectId: string;
  modelId: string;
  activeSection: ContentModelEditSectionKey;
}) {
  const { t } = useTranslation("content");
  const editPath = projectContentModelsEditPath(props.projectId, props.modelId);
  const settingsPath = `${editPath}&section=settings`;
  const items: AdminNavItem[] = [
    {
      key: "fields",
      icon: ListChecks,
      label: t("CONTENT_MODELS_EDIT_TAB_FIELDS"),
      to: editPath,
    },
    {
      key: "settings",
      icon: Settings2,
      label: t("CONTENT_MODELS_EDIT_TAB_SETTINGS"),
      to: settingsPath,
    },
  ];

  return (
    <SidebarProvider open onOpenChange={() => undefined} widthPx={240} className="!min-h-0 w-full">
      <AdminSiderNav
        items={items}
        showFavorites={false}
        className="m-0 w-full [&_[data-active]]:w-full [&_[data-sidebar=menu-button]]:w-full [&_[data-sidebar=menu-item]]:w-full [&_[data-sidebar=menu]]:w-full"
        pathnameOverride={props.activeSection === "settings" ? settingsPath : editPath}
      />
    </SidebarProvider>
  );
}

function FieldConfigSectionMenu(props: {
  activeSection: FieldConfigSectionKey;
  onSectionChange: (section: FieldConfigSectionKey) => void;
}) {
  const { t } = useTranslation("content");
  const items: AdminNavItem[] = [
    {
      key: "basic",
      icon: Pencil,
      label: t("CONTENT_MODELS_FIELD_CONFIG_TAB_BASIC"),
      isActive: props.activeSection === "basic",
      onAction: () => props.onSectionChange("basic"),
    },
    {
      key: "advanced",
      icon: Settings2,
      label: t("CONTENT_MODELS_FIELD_CONFIG_TAB_ADVANCED"),
      isActive: props.activeSection === "advanced",
      onAction: () => props.onSectionChange("advanced"),
    },
  ];

  return (
    <Highlight hover controlledItems mode="parent" enabled={false}>
      <SidebarProvider
        open
        onOpenChange={() => undefined}
        widthPx={224}
        className="!min-h-0 w-full"
      >
        <AdminSiderNav
          items={items}
          showFavorites={false}
          className="m-0 w-full [&_[data-active]]:w-full [&_[data-sidebar=menu-button]]:w-full [&_[data-sidebar=menu-item]]:w-full [&_[data-sidebar=menu]]:w-full"
          pathnameOverride={`content-model-field-config:${props.activeSection}`}
        />
      </SidebarProvider>
    </Highlight>
  );
}
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
  modelKind: ContentModelsTableRow["modelKind"];
  fieldTypeRegistry?: AdminContentModelFieldTypeRegistry;
  onOpenChange: (open: boolean) => void;
  onSelect: (typeId: ContentModelFieldTypeId) => void;
  onSelectCustom: (definition: AdminContentModelFieldTypeDefinition) => void;
}) {
  const { t } = useTranslation("content");
  const availableBuiltInTypeIds = React.useMemo(() => {
    const registryTypes = props.fieldTypeRegistry?.fieldTypes ?? [];
    if (registryTypes.length === 0) return null;
    return new Set(
      registryTypes
        .filter(
          (fieldType) =>
            fieldType.source === "built_in" &&
            fieldType.lifecycle === "active" &&
            fieldType.allowedModelKinds.includes(props.modelKind),
        )
        .map((fieldType) => fieldType.configKind),
    );
  }, [props.fieldTypeRegistry?.fieldTypes, props.modelKind]);
  const customFieldTypes = React.useMemo(
    () =>
      (props.fieldTypeRegistry?.fieldTypes ?? []).filter(
        (fieldType) =>
          fieldType.source === "plugin" &&
          fieldType.lifecycle === "active" &&
          fieldType.allowedModelKinds.includes(props.modelKind),
      ),
    [props.fieldTypeRegistry?.fieldTypes, props.modelKind],
  );

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
              {group.typeIds.flatMap((typeId) => {
                if (availableBuiltInTypeIds && !availableBuiltInTypeIds.has(typeId)) return [];
                const Icon = FIELD_TYPE_ICON_MAP[typeId];
                return [
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
                  </button>,
                ];
              })}
            </div>
          </section>
        ))}
      </div>
      {customFieldTypes.length > 0 ? (
        <section className="mt-5 grid gap-3 border-t border-border/60 pt-5">
          <div>
            <h3 className="text-headline text-label-primary">
              {t("CONTENT_MODELS_FIELD_TYPE_GROUP_CUSTOM_LABEL")}
            </h3>
            <p className="mt-1 text-callout text-label-secondary">
              {t("CONTENT_MODELS_FIELD_TYPE_GROUP_CUSTOM_DESC")}
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {customFieldTypes.map((fieldType) => (
              <button
                key={fieldType.uid}
                type="button"
                disabled={!props.canManageFields}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border border-border/70 bg-background px-4 py-3 text-left transition-colors",
                  "hover:border-border hover:bg-accent/45",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                onClick={() => props.onSelectCustom(fieldType)}
              >
                <Puzzle className="mt-0.5 size-4.5 shrink-0 text-label-primary" />
                <div className="min-w-0">
                  <div className="text-headline text-label-primary">
                    {fieldType.label ?? fieldType.uid}
                  </div>
                  {fieldType.description ? (
                    <div className="mt-1 text-callout text-label-secondary">
                      {fieldType.description}
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </SettingDialog>
  );
}

function DraftCheckboxSetting(props: {
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border/70 bg-background px-3 py-3">
      <Checkbox
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={(checked) => props.onChange(Boolean(checked))}
      />
      <div className="min-w-0">
        <div className="text-headline text-label-primary">{props.title}</div>
        <div className="mt-1 text-callout text-label-secondary">{props.description}</div>
      </div>
    </label>
  );
}

function supportsTextValidation(typeId: ContentModelFieldTypeId) {
  return (
    typeId === "short_text" || typeId === "rich_text" || typeId === "markdown" || typeId === "slug"
  );
}

function readPositiveIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function getFieldConfigFlag(row: ContentModelFieldRow, key: string): boolean {
  return Boolean(row.config && row.config[key] === true);
}

function moveFieldKey(
  rows: ContentModelFieldRow[],
  sourceKey: string,
  targetKey: string,
): string[] {
  const keys = rows.map((row) => row.key);
  const sourceIndex = keys.indexOf(sourceKey);
  const targetIndex = keys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return keys;
  const [source] = keys.splice(sourceIndex, 1);
  keys.splice(targetIndex, 0, source);
  return keys;
}

function FieldConfigDialog(props: {
  open: boolean;
  draft: ContentModelFieldDraft;
  errors: FieldDraftErrors;
  pending: boolean;
  keyReadOnly?: boolean;
  submitLabel: string;
  referenceOptions: ContentModelsTableRow[];
  componentOptions: ContentModelsTableRow[];
  referenceLoading: boolean;
  canManageFields: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (updater: (draft: ContentModelFieldDraft) => ContentModelFieldDraft) => void;
  onChangeType: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation("content");
  const typeLabel = t(getContentModelFieldTypeLabelKey(props.draft.typeId));
  const dynamicZoneKeys = React.useMemo(
    () =>
      new Set(
        props.draft.dynamicZoneComponentKeys
          .split("\n")
          .map((componentKey) => componentKey.trim())
          .filter(Boolean),
      ),
    [props.draft.dynamicZoneComponentKeys],
  );
  const [activeConfigSection, setActiveConfigSection] =
    React.useState<FieldConfigSectionKey>("basic");
  React.useEffect(() => {
    if (props.open) setActiveConfigSection("basic");
  }, [props.draft.typeId, props.open]);
  const toggleDynamicZoneComponent = React.useCallback(
    (componentKey: string, checked: boolean) => {
      props.onDraftChange((draft) => {
        const nextKeys = new Set(
          draft.dynamicZoneComponentKeys
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        );
        if (checked) {
          nextKeys.add(componentKey);
        } else {
          nextKeys.delete(componentKey);
        }
        return { ...draft, dynamicZoneComponentKeys: [...nextKeys].join("\n") };
      });
    },
    [props],
  );

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={typeLabel}
      description={t(getContentModelFieldTypeDescriptionKey(props.draft.typeId))}
      contentClassName="sm:max-w-4xl"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" disabled={props.pending} onClick={props.onChangeType}>
            {t("CONTENT_MODELS_FIELD_CONFIG_CHANGE_TYPE")}
          </Button>
          <Button
            loading={props.pending}
            disabled={!props.canManageFields}
            onClick={props.onSubmit}
          >
            {props.submitLabel}
          </Button>
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
        <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside
            className="min-w-0 border-b border-border/60 pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-3"
            aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NAV_LABEL")}
          >
            <FieldConfigSectionMenu
              activeSection={activeConfigSection}
              onSectionChange={setActiveConfigSection}
            />
          </aside>

          <div className="min-w-0">
            {activeConfigSection === "basic" ? (
              <SettingDialogFields>
                <SettingDialogField
                  title={t("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL")}
                  error={props.errors.name}
                >
                  <Input
                    aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NAME_LABEL")}
                    value={props.draft.name}
                    disabled={props.pending}
                    onChange={(event) =>
                      props.onDraftChange((draft) =>
                        syncContentModelFieldDraftName(draft, event.target.value),
                      )
                    }
                  />
                </SettingDialogField>

                <SettingDialogField
                  title={t("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")}
                  description={t("CONTENT_MODELS_FIELD_CONFIG_KEY_DESC")}
                  error={props.errors.key}
                >
                  <Input
                    aria-label={t("CONTENT_MODELS_FIELD_CONFIG_KEY_LABEL")}
                    value={props.draft.key.value}
                    disabled={props.pending || props.keyReadOnly}
                    onChange={(event) =>
                      props.onDraftChange((draft) =>
                        updateContentModelFieldDraftKey(draft, event.target.value),
                      )
                    }
                  />
                </SettingDialogField>

                <SettingDialogField
                  title={t("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_OPTIONAL_LABEL")}
                >
                  <Textarea
                    aria-label={t("CONTENT_MODELS_FIELD_CONFIG_DESCRIPTION_OPTIONAL_LABEL")}
                    value={props.draft.description}
                    disabled={props.pending}
                    rows={3}
                    onChange={(event) =>
                      props.onDraftChange((draft) => ({
                        ...draft,
                        description: event.target.value,
                      }))
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
                  </SettingDialogField>
                ) : null}

                {props.draft.typeId === "enumeration" ? (
                  <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_ENUM_OPTIONS_LABEL")}>
                    <Textarea
                      aria-label={t("CONTENT_MODELS_FIELD_CONFIG_ENUM_OPTIONS_LABEL")}
                      value={props.draft.enumerationOptions}
                      disabled={props.pending}
                      rows={5}
                      onChange={(event) =>
                        props.onDraftChange((draft) => ({
                          ...draft,
                          enumerationOptions: event.target.value,
                        }))
                      }
                    />
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
                  <SettingDialogField
                    title={t("CONTENT_MODELS_FIELD_CONFIG_BOOLEAN_DEFAULT_LABEL")}
                  >
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
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_MODE_LABEL")}
                    >
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
                          {t("CONTENT_MODELS_FIELD_CONFIG_REFERENCE_TARGET_UNSELECTED")}
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

                {props.draft.typeId === "component" ? (
                  <SettingDialogField
                    title={t("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_LABEL")}
                    error={props.errors.componentTargetModelKey}
                  >
                    <select
                      aria-label={t("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_LABEL")}
                      className="flex h-9 w-full rounded-md border border-border/70 bg-background px-3 text-footnote text-label-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"
                      disabled={props.pending || props.referenceLoading}
                      value={props.draft.componentTargetModelKey}
                      onChange={(event) =>
                        props.onDraftChange((draft) => ({
                          ...draft,
                          componentTargetModelKey: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {t("CONTENT_MODELS_FIELD_CONFIG_COMPONENT_TARGET_UNSELECTED")}
                      </option>
                      {props.componentOptions.map((model) => (
                        <option key={model.id} value={model.singularKey}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </SettingDialogField>
                ) : null}

                {props.draft.typeId === "dynamic_zone" ? (
                  <SettingDialogField
                    title={t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_COMPONENTS_LABEL")}
                    error={props.errors.dynamicZoneComponentKeys}
                  >
                    {props.componentOptions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {props.componentOptions.map((model) => (
                          <label
                            key={model.id}
                            className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-footnote text-label-primary"
                          >
                            <Checkbox
                              checked={dynamicZoneKeys.has(model.singularKey)}
                              disabled={props.pending || props.referenceLoading}
                              onCheckedChange={(checked) =>
                                toggleDynamicZoneComponent(model.singularKey, Boolean(checked))
                              }
                            />
                            <span className="min-w-0 truncate">{model.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-callout text-label-secondary">
                        {t("CONTENT_MODELS_FIELD_CONFIG_COMPONENTS_EMPTY")}
                      </div>
                    )}
                  </SettingDialogField>
                ) : null}
              </SettingDialogFields>
            ) : (
              <SettingDialogFields>
                {props.draft.typeId === "boolean" ? null : (
                  <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL")}>
                    <Input
                      aria-label={t("CONTENT_MODELS_FIELD_CONFIG_DEFAULT_VALUE_LABEL")}
                      value={props.draft.defaultValue}
                      disabled={props.pending}
                      onChange={(event) =>
                        props.onDraftChange((draft) => ({
                          ...draft,
                          defaultValue: event.target.value,
                        }))
                      }
                    />
                  </SettingDialogField>
                )}

                {supportsTextValidation(props.draft.typeId) ? (
                  <>
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_PATTERN_LABEL")}
                      error={props.errors.regexPattern}
                    >
                      <Input
                        aria-label={t("CONTENT_MODELS_FIELD_CONFIG_PATTERN_LABEL")}
                        value={props.draft.regexPattern}
                        disabled={props.pending}
                        onChange={(event) =>
                          props.onDraftChange((draft) => ({
                            ...draft,
                            regexPattern: event.target.value,
                          }))
                        }
                      />
                    </SettingDialogField>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SettingDialogField
                        title={t("CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL")}
                        error={props.errors.minLength}
                      >
                        <Input
                          aria-label={t("CONTENT_MODELS_FIELD_CONFIG_MIN_LENGTH_LABEL")}
                          value={props.draft.minLength}
                          disabled={props.pending}
                          onChange={(event) =>
                            props.onDraftChange((draft) => ({
                              ...draft,
                              minLength: event.target.value,
                            }))
                          }
                        />
                      </SettingDialogField>
                      <SettingDialogField
                        title={t("CONTENT_MODELS_FIELD_CONFIG_MAX_LENGTH_LABEL")}
                        error={props.errors.maxLength}
                      >
                        <Input
                          aria-label={t("CONTENT_MODELS_FIELD_CONFIG_MAX_LENGTH_LABEL")}
                          value={props.draft.maxLength}
                          disabled={props.pending}
                          onChange={(event) =>
                            props.onDraftChange((draft) => ({
                              ...draft,
                              maxLength: event.target.value,
                            }))
                          }
                        />
                      </SettingDialogField>
                    </div>
                  </>
                ) : null}

                {props.draft.typeId === "number" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL")}
                      error={props.errors.numberMin}
                    >
                      <Input
                        aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MIN_LABEL")}
                        value={props.draft.numberMin}
                        disabled={props.pending}
                        onChange={(event) =>
                          props.onDraftChange((draft) => ({
                            ...draft,
                            numberMin: event.target.value,
                          }))
                        }
                      />
                    </SettingDialogField>
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL")}
                      error={props.errors.numberMax}
                    >
                      <Input
                        aria-label={t("CONTENT_MODELS_FIELD_CONFIG_NUMBER_MAX_LABEL")}
                        value={props.draft.numberMax}
                        disabled={props.pending}
                        onChange={(event) =>
                          props.onDraftChange((draft) => ({
                            ...draft,
                            numberMax: event.target.value,
                          }))
                        }
                      />
                    </SettingDialogField>
                  </div>
                ) : null}

                {props.draft.typeId === "dynamic_zone" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MIN_LABEL")}
                      error={props.errors.dynamicZoneMin}
                    >
                      <Input
                        aria-label={t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MIN_LABEL")}
                        value={props.draft.dynamicZoneMin}
                        disabled={props.pending}
                        onChange={(event) =>
                          props.onDraftChange((draft) => ({
                            ...draft,
                            dynamicZoneMin: event.target.value,
                          }))
                        }
                      />
                    </SettingDialogField>
                    <SettingDialogField
                      title={t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MAX_LABEL")}
                      error={props.errors.dynamicZoneMax}
                    >
                      <Input
                        aria-label={t("CONTENT_MODELS_FIELD_CONFIG_DYNAMIC_ZONE_MAX_LABEL")}
                        value={props.draft.dynamicZoneMax}
                        disabled={props.pending}
                        onChange={(event) =>
                          props.onDraftChange((draft) => ({
                            ...draft,
                            dynamicZoneMax: event.target.value,
                          }))
                        }
                      />
                    </SettingDialogField>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <DraftCheckboxSetting
                    checked={props.draft.required}
                    disabled={props.pending}
                    title={t("CONTENT_MODELS_FIELD_CONFIG_REQUIRED_LABEL")}
                    description={t("CONTENT_MODELS_FIELD_CONFIG_REQUIRED_DESC")}
                    onChange={(checked) =>
                      props.onDraftChange((draft) => ({ ...draft, required: checked }))
                    }
                  />
                  <DraftCheckboxSetting
                    checked={props.draft.unique}
                    disabled={props.pending}
                    title={t("CONTENT_MODELS_FIELD_CONFIG_UNIQUE_LABEL")}
                    description={t("CONTENT_MODELS_FIELD_CONFIG_UNIQUE_DESC")}
                    onChange={(checked) =>
                      props.onDraftChange((draft) => ({ ...draft, unique: checked }))
                    }
                  />
                  <DraftCheckboxSetting
                    checked={props.draft.localizable}
                    disabled={props.pending}
                    title={t("CONTENT_MODELS_FIELD_CONFIG_LOCALIZED_LABEL")}
                    description={t("CONTENT_MODELS_FIELD_CONFIG_LOCALIZED_DESC")}
                    onChange={(checked) =>
                      props.onDraftChange((draft) => ({ ...draft, localizable: checked }))
                    }
                  />
                  <DraftCheckboxSetting
                    checked={props.draft.hiddenInEditor}
                    disabled={props.pending}
                    title={t("CONTENT_MODELS_FIELD_CONFIG_HIDDEN_EDITOR_LABEL")}
                    description={t("CONTENT_MODELS_FIELD_CONFIG_HIDDEN_EDITOR_DESC")}
                    onChange={(checked) =>
                      props.onDraftChange((draft) => ({ ...draft, hiddenInEditor: checked }))
                    }
                  />
                  <DraftCheckboxSetting
                    checked={props.draft.omitFromApiResponse}
                    disabled={props.pending}
                    title={t("CONTENT_MODELS_FIELD_CONFIG_OMIT_API_LABEL")}
                    description={t("CONTENT_MODELS_FIELD_CONFIG_OMIT_API_DESC")}
                    onChange={(checked) =>
                      props.onDraftChange((draft) => ({ ...draft, omitFromApiResponse: checked }))
                    }
                  />
                </div>

                <SettingDialogField title={t("CONTENT_MODELS_FIELD_CONFIG_CONDITION_LABEL")}>
                  <Textarea
                    aria-label={t("CONTENT_MODELS_FIELD_CONFIG_CONDITION_LABEL")}
                    value={props.draft.condition}
                    disabled={props.pending}
                    rows={3}
                    onChange={(event) =>
                      props.onDraftChange((draft) => ({ ...draft, condition: event.target.value }))
                    }
                  />
                </SettingDialogField>
              </SettingDialogFields>
            )}
          </div>
        </div>
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

function FieldRowMenu(props: {
  disabled?: boolean;
  hiddenInEditor: boolean;
  omittedFromApi: boolean;
  onToggleHiddenInEditor: () => void;
  onToggleOmitFromApi: () => void;
  onDelete: () => void;
}) {
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
          icon={<EyeOff className="size-4" />}
          disabled={props.disabled}
          onSelect={props.onToggleHiddenInEditor}
        >
          {props.hiddenInEditor
            ? t("content:CONTENT_MODELS_FIELD_ROW_SHOW_IN_EDITOR_ACTION")
            : t("content:CONTENT_MODELS_FIELD_ROW_HIDE_IN_EDITOR_ACTION")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem
          icon={<ShieldOff className="size-4" />}
          disabled={props.disabled}
          onSelect={props.onToggleOmitFromApi}
        >
          {props.omittedFromApi
            ? t("content:CONTENT_MODELS_FIELD_ROW_INCLUDE_API_ACTION")
            : t("content:CONTENT_MODELS_FIELD_ROW_OMIT_API_ACTION")}
        </DropdownMenuIconItem>
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
  onToggleFieldFlag: (
    row: ContentModelFieldRow,
    flag: "hiddenInEditor" | "omitFromApiResponse",
  ) => void;
  onBulkToggleFieldFlag: (
    rows: ContentModelFieldRow[],
    flag: "hiddenInEditor" | "omitFromApiResponse",
  ) => void;
  onDeleteField: (row: ContentModelFieldRow) => void;
  onReorderField: (sourceKey: string, targetKey: string) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const [searchInput, setSearchInput] = React.useState("");
  const [rowHeight] = useDataTableRowHeightPreference({ tableId: props.tableId });
  const [wrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: props.tableId,
  });
  const [draggingFieldKey, setDraggingFieldKey] = React.useState<string | null>(null);
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
          <div
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-sm",
              draggingFieldKey && draggingFieldKey !== row.original.key
                ? "outline outline-1 outline-primary/20"
                : undefined,
            )}
            onDragOver={(event) => {
              if (!draggingFieldKey || draggingFieldKey === row.original.key) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggingFieldKey || draggingFieldKey === row.original.key) return;
              props.onReorderField(draggingFieldKey, row.original.key);
              setDraggingFieldKey(null);
            }}
          >
            <button
              type="button"
              className="inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-label-tertiary transition-colors hover:bg-muted/60 hover:text-label-primary active:cursor-grabbing"
              aria-label={t("content:CONTENT_MODELS_FIELD_ROW_DRAG_ACTION")}
              disabled={props.pending || !props.canManageFields}
              draggable={!props.pending && props.canManageFields}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", row.original.key);
                setDraggingFieldKey(row.original.key);
              }}
              onDragEnd={() => setDraggingFieldKey(null)}
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-0 truncate text-headline text-label-primary">
              {row.original.label}
            </span>
            <ContentModelFieldKeyTag
              label={row.original.key}
              textStyle="caption"
              className="shrink-0"
            />
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
          const Icon = FIELD_TYPE_ICON_MAP[typeId];
          return (
            <ContentModelFieldTypeTag
              icon={Icon}
              label={t(getContentModelFieldTypeLabelKey(typeId))}
              textStyle="caption"
            />
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
              hiddenInEditor={getFieldConfigFlag(row.original, "hiddenInEditor")}
              omittedFromApi={getFieldConfigFlag(row.original, "omitFromApiResponse")}
              onToggleHiddenInEditor={() => props.onToggleFieldFlag(row.original, "hiddenInEditor")}
              onToggleOmitFromApi={() =>
                props.onToggleFieldFlag(row.original, "omitFromApiResponse")
              }
              onDelete={() => props.onDeleteField(row.original)}
            />
          </DataTableActionsCell>
        ),
        size: 132,
        minSize: 132,
      },
    ],
    [draggingFieldKey, props, t],
  );
  const tableCore = useDataTableCore<ContentModelFieldRow>({
    columns,
    data: filteredRows,
    pageCount: 1,
    initialState: {
      pageSize: 500,
    },
    rowSelection: {
      enabled: true,
      getRowId: (row) => row.key,
    },
    features: {
      sorting: { enabled: true, mode: "client" },
    },
  });
  const selectedFieldRows = tableCore.table.getSelectedRowModel().rows.map((row) => row.original);
  const toolbar = (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataTableSearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t("content:CONTENT_MODELS_FIELDS_SEARCH_PLACEHOLDER")}
          clearLabel={t("common:CLEAR")}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common:REFRESH")}
          disabled={props.refreshing}
          onClick={props.onRefresh}
        >
          <RefreshCw className={cn("size-4", props.refreshing ? "animate-spin" : undefined)} />
        </Button>
      </div>
      {selectedFieldRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-3 py-2">
          <SelectedCountTag
            label={t("content:CONTENT_MODELS_FIELDS_SELECTED_COUNT", {
              count: selectedFieldRows.length,
            })}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={props.pending}
            onClick={() => props.onBulkToggleFieldFlag(selectedFieldRows, "hiddenInEditor")}
          >
            <EyeOff className="size-4" />
            {t("content:CONTENT_MODELS_FIELD_ROW_HIDE_IN_EDITOR_ACTION")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={props.pending}
            onClick={() => props.onBulkToggleFieldFlag(selectedFieldRows, "omitFromApiResponse")}
          >
            <ShieldOff className="size-4" />
            {t("content:CONTENT_MODELS_FIELD_ROW_OMIT_API_ACTION")}
          </Button>
        </div>
      ) : null}
    </div>
  );
  const footerSlot = (
    <div className="w-full">
      <Button
        variant="ghost"
        className="w-full justify-center"
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
      rowClassName={(row) => (row.getIsSelected() ? "bg-muted/35 hover:bg-muted/45" : undefined)}
      onRowClick={(row, _rowIndex, event) => {
        if (event.detail >= 2) {
          props.onEditField(row.original);
          return;
        }
        row.toggleSelected();
      }}
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
  const [fieldToEdit, setFieldToEdit] = React.useState<ContentModelFieldRow | null>(null);
  const [fieldToDelete, setFieldToDelete] = React.useState<ContentModelFieldRow | null>(null);
  const [fieldsRefreshing, setFieldsRefreshing] = React.useState(false);
  const activeSection: ContentModelEditSectionKey =
    props.section === "settings" ? "settings" : "fields";
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
      setFieldToEdit(null);
      setFieldToDelete(null);
      setFieldsRefreshing(false);
    }
  }, [activeModel]);

  const referenceModelsQuery = useQuery({
    queryKey: ["content", "models", "all", props.projectId],
    queryFn: () => listAllContentModels(props.projectId),
    enabled:
      configDialogOpen &&
      (draft.typeId === "reference" ||
        draft.typeId === "component" ||
        draft.typeId === "dynamic_zone"),
    staleTime: 60_000,
  });

  const fieldTypeRegistryQuery = useQuery({
    queryKey: buildContentModelFieldTypesQueryKey(props.projectId),
    queryFn: () => getContentModelFieldTypeRegistry(props.projectId),
    enabled: typePickerOpen,
    staleTime: 300_000,
  });

  const referenceOptions = React.useMemo(
    () =>
      (referenceModelsQuery.data ?? []).filter(
        (model) => model.id !== activeModel?.id && model.modelKind !== "component",
      ),
    [activeModel?.id, referenceModelsQuery.data],
  );

  const componentOptions = React.useMemo(
    () => (referenceModelsQuery.data ?? []).filter((model) => model.modelKind === "component"),
    [referenceModelsQuery.data],
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

  const updateFieldMutation = useMutation({
    mutationFn: async () => {
      if (!activeModel) throw new Error("CONTENT_MODELS_ACTIVE_MODEL_REQUIRED");
      if (!fieldToEdit) throw new Error("CONTENT_MODELS_ACTIVE_FIELD_REQUIRED");
      const payload = buildContentModelFieldPayload(draft);
      return updateContentModelField(props.projectId, activeModel.id, fieldToEdit.key, {
        label: payload.label,
        scalar: payload.scalar,
        required: payload.required,
        config: payload.config,
      });
    },
    onSuccess: async (model) => {
      await syncModel(model);
      setConfigDialogOpen(false);
      setTypePickerOpen(false);
      setFieldToEdit(null);
      setDraft(createContentModelFieldDraft("short_text"));
      setDraftErrors({});
      notifySuccessText(t("CONTENT_MODELS_FIELD_UPDATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const reorderFieldMutation = useMutation({
    mutationFn: async (fieldKeys: string[]) => {
      if (!activeModel) throw new Error("CONTENT_MODELS_ACTIVE_MODEL_REQUIRED");
      return reorderContentModelFields(props.projectId, activeModel.id, { fieldKeys });
    },
    onSuccess: async (model) => {
      await syncModel(model);
      notifySuccessText(t("CONTENT_MODELS_FIELD_REORDER_SUCCESS"));
    },
    onError: notifyError,
  });

  const patchFieldConfigMutation = useMutation({
    mutationFn: async (
      updates: Array<{ row: ContentModelFieldRow; config: Record<string, JsonValueInput> }>,
    ) => {
      if (!activeModel) throw new Error("CONTENT_MODELS_ACTIVE_MODEL_REQUIRED");
      const results = await Promise.all(
        updates.map((update) =>
          updateContentModelField(props.projectId, activeModel.id, update.row.key, {
            config: update.config,
          }),
        ),
      );
      const nextModel = results.at(-1);
      if (!nextModel) throw new Error("CONTENT_MODELS_ACTIVE_FIELD_REQUIRED");
      return nextModel;
    },
    onSuccess: async (model) => {
      await syncModel(model);
      notifySuccessText(t("CONTENT_MODELS_FIELD_UPDATE_SUCCESS"));
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
    const existingKeys = new Set(
      fieldRows.filter((row) => row.key !== fieldToEdit?.key).map((row) => row.key),
    );

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
    if (draft.typeId === "component" && !draft.componentTargetModelKey.trim()) {
      errors.componentTargetModelKey = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_COMPONENT_TARGET");
    }
    if (draft.typeId === "dynamic_zone") {
      const components = draft.dynamicZoneComponentKeys
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      if (components.length === 0) {
        errors.dynamicZoneComponentKeys = t(
          "CONTENT_MODELS_FIELD_CONFIG_VALIDATION_DYNAMIC_ZONE_COMPONENTS",
        );
      }
      const min = readPositiveIntegerInput(draft.dynamicZoneMin);
      const max = readPositiveIntegerInput(draft.dynamicZoneMax);
      if (Number.isNaN(min)) {
        errors.dynamicZoneMin = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_POSITIVE_INTEGER");
      }
      if (Number.isNaN(max)) {
        errors.dynamicZoneMax = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_POSITIVE_INTEGER");
      }
      if (min !== null && max !== null && !Number.isNaN(min) && !Number.isNaN(max) && min > max) {
        errors.dynamicZoneMax = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_NUMBER_RANGE");
      }
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

    if (supportsTextValidation(draft.typeId)) {
      const minLength = readPositiveIntegerInput(draft.minLength);
      const maxLength = readPositiveIntegerInput(draft.maxLength);
      if (Number.isNaN(minLength)) {
        errors.minLength = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_POSITIVE_INTEGER");
      }
      if (Number.isNaN(maxLength)) {
        errors.maxLength = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_POSITIVE_INTEGER");
      }
      if (
        minLength !== null &&
        maxLength !== null &&
        !Number.isNaN(minLength) &&
        !Number.isNaN(maxLength) &&
        minLength > maxLength
      ) {
        errors.maxLength = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_LENGTH_RANGE");
      }
      if (draft.regexPattern.trim()) {
        try {
          new RegExp(draft.regexPattern);
        } catch {
          errors.regexPattern = t("CONTENT_MODELS_FIELD_CONFIG_VALIDATION_PATTERN");
        }
      }
    }

    return errors;
  }, [draft, fieldRows, fieldToEdit?.key, t]);

  const handleOpenAddField = React.useCallback(() => {
    setFieldToEdit(null);
    setDraft(createContentModelFieldDraft("short_text"));
    setDraftErrors({});
    setTypePickerOpen(true);
  }, []);

  const handleOpenEditField = React.useCallback((row: ContentModelFieldRow) => {
    setFieldToEdit(row);
    setDraft(createContentModelFieldDraftFromRow(row));
    setDraftErrors({});
    setConfigDialogOpen(true);
  }, []);

  const handleSelectType = React.useCallback((typeId: ContentModelFieldTypeId) => {
    setDraft((current) =>
      createContentModelFieldDraft(typeId, {
        name: current.name,
        key: current.key,
        description: current.description,
        required: current.required,
        localizable: current.localizable,
        unique: current.unique,
        hiddenInEditor: current.hiddenInEditor,
        omitFromApiResponse: current.omitFromApiResponse,
        defaultValue: current.defaultValue,
        condition: current.condition,
        componentTargetModelKey: current.componentTargetModelKey,
        dynamicZoneComponentKeys: current.dynamicZoneComponentKeys,
        dynamicZoneMin: current.dynamicZoneMin,
        dynamicZoneMax: current.dynamicZoneMax,
      }),
    );
    setDraftErrors({});
    setTypePickerOpen(false);
    setConfigDialogOpen(true);
  }, []);

  const handleSelectCustomType = React.useCallback(
    (definition: AdminContentModelFieldTypeDefinition) => {
      setDraft((current) =>
        createContentModelFieldDraft("custom", {
          name: current.name,
          key: current.key,
          description: current.description,
          required: current.required,
          localizable: current.localizable,
          unique: current.unique,
          hiddenInEditor: current.hiddenInEditor,
          omitFromApiResponse: current.omitFromApiResponse,
          defaultValue: current.defaultValue,
          condition: current.condition,
          customFieldUid: definition.uid,
          customFieldScalar: definition.scalar,
        }),
      );
      setDraftErrors({});
      setTypePickerOpen(false);
      setConfigDialogOpen(true);
    },
    [],
  );

  const handleSubmitDraft = React.useCallback(() => {
    const errors = validateDraft();
    setDraftErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (fieldToEdit) {
      void updateFieldMutation.mutateAsync();
      return;
    }
    void addFieldMutation.mutateAsync();
  }, [addFieldMutation, fieldToEdit, updateFieldMutation, validateDraft]);

  const handleToggleFieldFlag = React.useCallback(
    (row: ContentModelFieldRow, flag: "hiddenInEditor" | "omitFromApiResponse") => {
      const nextConfig: Record<string, JsonValueInput> = {
        ...(row.config as Record<string, JsonValueInput>),
        [flag]: !getFieldConfigFlag(row, flag),
      };
      void patchFieldConfigMutation.mutateAsync([{ row, config: nextConfig }]);
    },
    [patchFieldConfigMutation],
  );

  const handleBulkToggleFieldFlag = React.useCallback(
    (rows: ContentModelFieldRow[], flag: "hiddenInEditor" | "omitFromApiResponse") => {
      const updates = rows
        .filter((row) => !row.locked)
        .map((row) => ({
          row,
          config: { ...(row.config as Record<string, JsonValueInput>), [flag]: true },
        }));
      if (updates.length === 0) return;
      void patchFieldConfigMutation.mutateAsync(updates);
    },
    [patchFieldConfigMutation],
  );

  const handleReorderField = React.useCallback(
    (sourceKey: string, targetKey: string) => {
      const fieldKeys = moveFieldKey(fieldRows, sourceKey, targetKey);
      if (fieldKeys.join("\u0000") === fieldRows.map((row) => row.key).join("\u0000")) return;
      void reorderFieldMutation.mutateAsync(fieldKeys);
    },
    [fieldRows, reorderFieldMutation],
  );

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
    updateFieldMutation.isPending ||
    reorderFieldMutation.isPending ||
    patchFieldConfigMutation.isPending ||
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
      <Button variant="primary" onClick={props.onClose} disabled={pending}>
        <ArrowLeft className="size-4" />
        {t("CONTENT_MODELS_EDIT_BACK_ACTION")}
      </Button>
    </div>
  );
  const pageDescription = activeModel.description?.trim() || undefined;
  const fieldsContent =
    fieldRows.length === 0 ? (
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
      <div className="mx-auto flex min-h-full w-full flex-col">
        <FieldsTable
          tableId={tableId}
          rows={fieldRows}
          canManageFields={canManageFields}
          pending={pending}
          refreshing={fieldsRefreshing}
          onAddField={handleOpenAddField}
          onEditField={handleOpenEditField}
          onToggleFieldFlag={handleToggleFieldFlag}
          onBulkToggleFieldFlag={handleBulkToggleFieldFlag}
          onDeleteField={setFieldToDelete}
          onReorderField={handleReorderField}
          onRefresh={() => void handleRefreshFields()}
        />
      </div>
    );
  const content =
    activeSection === "fields" ? (
      <section className="min-h-0 pb-8">{fieldsContent}</section>
    ) : (
      <ContentModelSettingsTab
        projectId={props.projectId}
        model={activeModel}
        canManageModels={props.canManageModels !== false}
        pending={pending}
        onModelChange={props.onModelChange}
      />
    );
  const renderSectionMenu = () => (
    <ContentModelEditSectionMenu
      projectId={props.projectId}
      modelId={activeModel.id}
      activeSection={activeSection}
    />
  );
  const hasFields = fieldRows.length > 0;

  return (
    <DefaultPage
      title={activeModel.name}
      description={pageDescription}
      showFavoriteToggle
      favoritePath={projectContentModelsEditPath(props.projectId, activeModel.id)}
      afterFavorite={copyIdAction}
      action={headerAction}
      headerBehavior="sticky"
      contentContainerClassName="[--page-sticky-header-height:6rem]"
    >
      <div className="flex min-h-full w-full gap-8">
        {hasFields ? (
          <aside className="hidden min-h-full w-60 shrink-0 lg:block">
            <div className="sticky top-[var(--page-sticky-header-height,6rem)] max-h-[calc(100vh-var(--page-sticky-header-height,6rem)-1rem)] min-h-0 overflow-y-auto pb-4">
              {renderSectionMenu()}
            </div>
          </aside>
        ) : null}

        <div className="min-w-0 flex-1">
          {hasFields ? <div className="mb-5 lg:hidden">{renderSectionMenu()}</div> : null}
          {content}
        </div>
      </div>

      <FieldTypePickerDialog
        open={typePickerOpen}
        canManageFields={canManageFields}
        modelKind={activeModel.modelKind}
        fieldTypeRegistry={fieldTypeRegistryQuery.data}
        onOpenChange={setTypePickerOpen}
        onSelect={handleSelectType}
        onSelectCustom={handleSelectCustomType}
      />
      <FieldConfigDialog
        open={configDialogOpen}
        draft={draft}
        errors={draftErrors}
        pending={addFieldMutation.isPending || updateFieldMutation.isPending}
        keyReadOnly={Boolean(fieldToEdit)}
        submitLabel={
          fieldToEdit
            ? t("CONTENT_MODELS_FIELD_CONFIG_SAVE")
            : t("CONTENT_MODELS_FIELD_CONFIG_SUBMIT")
        }
        referenceOptions={referenceOptions}
        componentOptions={componentOptions}
        referenceLoading={referenceModelsQuery.isLoading}
        canManageFields={canManageFields}
        onOpenChange={(open) => {
          setConfigDialogOpen(open);
          if (!open) setFieldToEdit(null);
        }}
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
  );
}
