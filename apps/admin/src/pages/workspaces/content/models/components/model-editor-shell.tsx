import { Input, Select, Tag } from "antd";

import type {
  ContentDefaultEditor,
  ContentModelCapability,
  ContentModelCategory,
} from "@celestial/api-client";
import type { CreateContentModelInput } from "@/api/content-models";

import {
  CONTENT_MODEL_CATEGORY_LABEL_KEYS,
  CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS,
} from "./content-model-labels";
import {
  LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS,
  type LegacyContentModelTemplateId,
} from "./content-model-templates";
import { ModelCapabilitiesEditor } from "./model-capabilities-editor";
import { ModelFieldsEditor } from "./model-fields-editor";
import { ModelRelationsEditor } from "./model-relations-editor";
import { ModelRoutingEditor } from "./model-routing-editor";
import { ModelViewsEditor } from "./model-views-editor";

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

export type ModelEditorDraft = {
  templateId: LegacyContentModelTemplateId;
  name: string;
  key: string;
  kind: CreateContentModelInput["kind"];
  category?: ContentModelCategory;
  description: string;
  capabilities: ContentModelCapability[];
  defaultEditor?: ContentDefaultEditor;
  fieldSchemaText: string;
  relationSchemaText: string;
  routingMode: string;
  routingPattern: string;
  defaultView: string;
  workflowSupportsSchedule: boolean;
};

function buildTemplateButtonClass(selected: boolean): string {
  return selected
    ? "rounded-2xl border border-primary bg-primary/5 p-3 text-left transition-colors"
    : "rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30";
}

function ImpactTag(props: { children: React.ReactNode }) {
  return (
    <Tag variant="filled" className="m-0 rounded-md px-2 py-1">
      {props.children}
    </Tag>
  );
}

export function ModelEditorShell(props: {
  disabled?: boolean;
  draft: ModelEditorDraft;
  onDraftChange: (updater: (draft: ModelEditorDraft) => ModelEditorDraft) => void;
  onTemplateSelect: (templateId: LegacyContentModelTemplateId) => void;
  translate: (key: string) => string;
}) {
  const { draft, translate } = props;
  const fieldsCount = draft.fieldSchemaText.trim() ? 1 : 0;
  const relationsCount = draft.relationSchemaText.trim() ? 1 : 0;

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {translate("content_library:MODELS_FIELD_TEMPLATE_LABEL")}
        </label>
        <div className="text-footnote text-label-secondary">
          {translate("content_library:MODELS_TEMPLATE_OPTIONAL_DESC")}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={buildTemplateButtonClass(draft.templateId === preset.id)}
              disabled={props.disabled}
              onClick={() => props.onTemplateSelect(preset.id)}
            >
              <div className="text-body font-medium text-foreground">
                {translate(preset.titleKey)}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {translate(preset.summaryKey)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {translate("content_library:MODELS_FIELD_NAME_LABEL")}
        </label>
        <Input
          autoFocus
          disabled={props.disabled}
          value={draft.name}
          placeholder={translate("content_library:MODELS_FIELD_NAME_PLACEHOLDER")}
          onChange={(event) =>
            props.onDraftChange((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>

      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {translate("content_library:MODELS_FIELD_KEY_LABEL")}
        </label>
        <Input
          disabled={props.disabled}
          value={draft.key}
          placeholder={translate("content_library:MODELS_FIELD_KEY_PLACEHOLDER")}
          onChange={(event) =>
            props.onDraftChange((current) => ({ ...current, key: event.target.value }))
          }
        />
      </div>

      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {translate("content_library:MODELS_FIELD_KIND_LABEL")}
        </label>
        <Select
          disabled={props.disabled}
          value={draft.kind}
          options={MODEL_KIND_OPTIONS.map((item) => ({
            value: item.value,
            label: translate(item.labelKey),
          }))}
          onChange={(kind) => props.onDraftChange((current) => ({ ...current, kind }))}
        />
      </div>

      <ModelCapabilitiesEditor
        disabled={props.disabled}
        value={draft.capabilities}
        onChange={(capabilities) =>
          props.onDraftChange((current) => ({ ...current, capabilities }))
        }
        translate={translate}
      />

      <ModelFieldsEditor
        disabled={props.disabled}
        value={draft.fieldSchemaText}
        onChange={(fieldSchemaText) =>
          props.onDraftChange((current) => ({
            ...current,
            fieldSchemaText,
          }))
        }
        translate={translate}
      />

      <ModelRelationsEditor
        disabled={props.disabled}
        value={draft.relationSchemaText}
        onChange={(relationSchemaText) =>
          props.onDraftChange((current) => ({
            ...current,
            relationSchemaText,
          }))
        }
        translate={translate}
      />

      <ModelRoutingEditor
        disabled={props.disabled}
        mode={draft.routingMode}
        pattern={draft.routingPattern}
        onModeChange={(routingMode) =>
          props.onDraftChange((current) => ({ ...current, routingMode }))
        }
        onPatternChange={(routingPattern) =>
          props.onDraftChange((current) => ({
            ...current,
            routingPattern,
          }))
        }
        translate={translate}
      />

      <ModelViewsEditor
        disabled={props.disabled}
        defaultEditor={draft.defaultEditor ?? ""}
        defaultView={draft.defaultView}
        workflowSupportsSchedule={draft.workflowSupportsSchedule}
        onDefaultEditorChange={(defaultEditorRaw) =>
          props.onDraftChange((current) => ({
            ...current,
            defaultEditor: defaultEditorRaw.trim()
              ? (defaultEditorRaw as ContentDefaultEditor)
              : undefined,
          }))
        }
        onDefaultViewChange={(defaultView) =>
          props.onDraftChange((current) => ({ ...current, defaultView }))
        }
        onWorkflowScheduleChange={(workflowSupportsSchedule) =>
          props.onDraftChange((current) => ({
            ...current,
            workflowSupportsSchedule,
          }))
        }
        translate={translate}
      />

      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <div className="text-body font-semibold text-foreground">
          {translate("content_library:MODELS_IMPACT_TITLE")}
        </div>
        <div className="mt-1 text-footnote text-label-secondary">
          {translate("content_library:MODELS_IMPACT_DESC")}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_FIELDS")} {fieldsCount}
          </ImpactTag>
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_RELATIONS")} {relationsCount}
          </ImpactTag>
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_CAPABILITIES")} {draft.capabilities.length}
          </ImpactTag>
          {draft.category ? (
            <ImpactTag>{translate(CONTENT_MODEL_CATEGORY_LABEL_KEYS[draft.category])}</ImpactTag>
          ) : null}
          {draft.defaultEditor ? (
            <ImpactTag>
              {translate(CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS[draft.defaultEditor])}
            </ImpactTag>
          ) : null}
        </div>
      </div>
    </div>
  );
}
