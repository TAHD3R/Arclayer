import { Button, Select } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
} from "@celestial/api-client";
import type { CreateContentModelInput } from "@/api/content-models";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { SettingDialog } from "@celestial/ui/setting-dialog";

import {
  buildLegacyCreateContentModelInput,
  getLegacyContentModelTemplatePreset,
  type LegacyContentModelTemplateId,
} from "./content-model-templates";
import { ModelEditorShell, type ModelEditorDraft } from "./model-editor-shell";

const MODEL_KIND_OPTIONS: Array<{ value: CreateContentModelInput["kind"]; labelKey: string }> = [
  { value: "custom", labelKey: "content_library:MODELS_KIND_CUSTOM" },
  { value: "post", labelKey: "content_library:MODELS_KIND_POST" },
  { value: "page", labelKey: "content_library:MODELS_KIND_PAGE" },
  { value: "component", labelKey: "content_library:MODELS_KIND_COMPONENT" },
  { value: "block", labelKey: "content_library:MODELS_KIND_BLOCK" },
  { value: "menu", labelKey: "content_library:MODELS_KIND_MENU" },
  { value: "template", labelKey: "content_library:MODELS_KIND_TEMPLATE" },
  { value: "view", labelKey: "content_library:MODELS_KIND_VIEW" },
];

type TranslateFn = (key: string) => string;

type JsonRecord = Record<string, unknown>;

function toJsonText(value: unknown): string {
  if (!value) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function parseOptionalJsonObject(input: string, label: string): JsonRecord | null {
  const text = input.trim();
  if (!text) {
    return null;
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as JsonRecord;
}

function extractRoutingMode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "none";
  }
  const mode = (value as Record<string, unknown>).mode;
  return typeof mode === "string" && mode.trim() ? mode.trim() : "none";
}

function extractRoutingPattern(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const pattern = (value as Record<string, unknown>).pattern;
  return typeof pattern === "string" && pattern.trim() ? pattern.trim() : "";
}

function extractWorkflowSchedule(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).supportsSchedule === true;
}

function extractDefaultView(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const defaultView = (value as Record<string, unknown>).defaultView;
  return typeof defaultView === "string" && defaultView.trim() ? defaultView.trim() : "";
}

function extractCategory(value: unknown): ContentModelCategory | undefined {
  if (value === "site_builder") return "site_builder";
  if (value === "content_library") return "content_library";
  if (value === "system") return "system";
  if (value === "custom") return "custom";
  return undefined;
}

function extractDefaultEditor(value: unknown): ContentDefaultEditor | undefined {
  if (value === "form") return "form";
  if (value === "visual") return "visual";
  if (value === "rich_text") return "rich_text";
  if (value === "table") return "table";
  return undefined;
}

function extractCapabilities(value: unknown): ContentModelCapability[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is ContentModelCapability =>
      item === "versioned" ||
      item === "routable" ||
      item === "treeable" ||
      item === "visual_editable" ||
      item === "rich_text_editable" ||
      item === "queryable" ||
      item === "has_slots" ||
      item === "has_relations" ||
      item === "localizable" ||
      item === "publishable" ||
      item === "schedulable" ||
      item === "seo_managed",
  );
}

function createBlankDraft(): ModelEditorDraft {
  return {
    templateId: "custom",
    name: "",
    key: "",
    kind: "custom",
    description: "",
    capabilities: [],
    fieldSchemaText: "",
    relationSchemaText: "",
    routingMode: "none",
    routingPattern: "",
    defaultView: "",
    workflowSupportsSchedule: false,
  };
}

function buildDraftFromTemplate(templateId: LegacyContentModelTemplateId, translate: TranslateFn) {
  const preset = getLegacyContentModelTemplatePreset(templateId);
  const model = buildLegacyCreateContentModelInput(preset, translate);

  return {
    templateId,
    name: model.name,
    key: model.key,
    kind: model.kind,
    category: extractCategory(model.category),
    description: model.description ?? "",
    capabilities: extractCapabilities(model.capabilities),
    defaultEditor: extractDefaultEditor(model.defaultEditor),
    fieldSchemaText: toJsonText(model.fieldSchema),
    relationSchemaText: toJsonText(model.relationSchema),
    routingMode: extractRoutingMode(model.routingSchema),
    routingPattern: extractRoutingPattern(model.routingSchema),
    defaultView: extractDefaultView(model.viewSchema),
    workflowSupportsSchedule: extractWorkflowSchedule(model.workflowPolicy),
  } satisfies ModelEditorDraft;
}

function buildCreateInputFromDraft(draft: ModelEditorDraft): CreateContentModelInput {
  const fieldSchema = parseOptionalJsonObject(draft.fieldSchemaText, "fieldSchema");
  const relationSchema = parseOptionalJsonObject(draft.relationSchemaText, "relationSchema");
  const routingSchema =
    draft.routingMode.trim() && draft.routingMode !== "none"
      ? {
          mode: draft.routingMode.trim(),
          ...(draft.routingPattern.trim() ? { pattern: draft.routingPattern.trim() } : {}),
        }
      : null;
  const viewSchema = draft.defaultView.trim() ? { defaultView: draft.defaultView.trim() } : null;

  return {
    key: draft.key.trim(),
    name: draft.name.trim(),
    kind: draft.kind,
    ...(draft.category ? { category: draft.category } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.capabilities.length ? { capabilities: draft.capabilities } : {}),
    ...(draft.defaultEditor ? { defaultEditor: draft.defaultEditor } : {}),
    ...(fieldSchema ? { fieldSchema } : { fieldSchema: null }),
    ...(relationSchema ? { relationSchema } : {}),
    ...(routingSchema ? { routingSchema } : {}),
    ...(viewSchema ? { viewSchema } : {}),
    workflowPolicy: draft.workflowSupportsSchedule ? { supportsSchedule: true } : null,
    ...(draft.templateId !== "custom" ? { templateKey: draft.templateId } : {}),
  };
}

function DialogFooter(props: {
  canSubmit: boolean;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
  translate: TranslateFn;
}) {
  return (
    <>
      <Button
        type="text"
        autoInsertSpace={false}
        disabled={props.confirmLoading}
        onClick={props.onCancel}
      >
        {props.translate("common:CANCEL")}
      </Button>
      <Button
        type="primary"
        autoInsertSpace={false}
        icon={<Plus className="size-4" aria-hidden="true" />}
        loading={props.confirmLoading}
        disabled={!props.canSubmit}
        onClick={props.onSubmit}
      >
        {props.translate("content_library:MODELS_DIALOG_SUBMIT")}
      </Button>
    </>
  );
}

export function CreateContentModelDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateContentModelInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [draft, setDraft] = useState<ModelEditorDraft>(() => createBlankDraft());

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setDraft(createBlankDraft());
  }, [props.open]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) {
      return false;
    }
    return draft.key.trim().length > 0 && draft.name.trim().length > 0;
  }, [draft.key, draft.name, props.confirmLoading]);

  const handleSubmit = async () => {
    await props.onConfirm(buildCreateInputFromDraft(draft));
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("content_library:MODELS_DIALOG_TITLE")}
      description={t("content_library:MODELS_DIALOG_DESC")}
      footer={
        <DialogFooter
          canSubmit={canSubmit}
          confirmLoading={props.confirmLoading}
          onCancel={() => props.onOpenChange(false)}
          onSubmit={handleSubmit}
          translate={t}
        />
      }
    >
      <div className="grid gap-4 py-2">
        <div className="grid gap-1.5">
          <label className="font-semibold text-foreground">
            {t("content_library:MODELS_FIELD_KIND_LABEL")}
          </label>
          <Select
            value={draft.kind}
            disabled={props.confirmLoading}
            options={MODEL_KIND_OPTIONS.map((item) => ({
              value: item.value,
              label: t(item.labelKey),
            }))}
            onChange={(kind) => setDraft((current) => ({ ...current, kind }))}
            getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
          />
        </div>

        <ModelEditorShell
          disabled={props.confirmLoading}
          draft={draft}
          onDraftChange={(updater) => setDraft((current) => updater(current))}
          onTemplateSelect={(templateId) => setDraft(buildDraftFromTemplate(templateId, t))}
          translate={t}
        />
      </div>
    </SettingDialog>
  );
}
