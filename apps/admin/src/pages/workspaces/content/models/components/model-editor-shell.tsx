import { Button, Input, Tag } from "antd";

import type { ContentDefaultEditor } from "@celestial/api-client";

import {
  CONTENT_MODEL_CATEGORY_LABEL_KEYS,
  CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS,
} from "./content-model-labels";
import { getImpactCounts, getStarterLabel, type ModelEditorDraft } from "./model-editor-draft";
import { ModelCapabilitiesEditor } from "./model-capabilities-editor";
import { ModelFieldsEditor } from "./model-fields-editor";
import { ModelRelationsEditor } from "./model-relations-editor";
import { ModelRoutingEditor } from "./model-routing-editor";
import { ModelViewsEditor } from "./model-views-editor";

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
  onImportStarter: () => void;
  translate: (key: string) => string;
}) {
  const { draft, translate } = props;
  const impact = getImpactCounts(draft);
  const starterLabel = getStarterLabel(draft.starterId, translate);
  const hasDraftState =
    Boolean(draft.name.trim()) ||
    Boolean(draft.key.trim()) ||
    impact.fields > 0 ||
    impact.relations > 0 ||
    impact.capabilities > 0;

  return (
    <div className="grid gap-5 py-1 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
      <div className="grid gap-4">
        <section className="rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="text-title3 text-foreground">
                {translate("content_library:MODELS_PANEL_WORKSPACE_TITLE")}
              </div>
              <div className="text-footnote text-label-secondary">
                {translate("content_library:MODELS_DIALOG_DESC")}
              </div>
            </div>
            <Button
              type="text"
              autoInsertSpace={false}
              disabled={props.disabled}
              onClick={props.onImportStarter}
            >
              {translate("content_library:MODELS_IMPORT_ACTION")}
            </Button>
          </div>

          {starterLabel ? (
            <div className="mt-4 rounded-2xl border border-border/80 bg-muted/20 p-4">
              <div className="text-footnote uppercase tracking-[0.18em] text-label-secondary">
                {translate("content_library:MODELS_IMPORT_SELECTED_PREFIX")}
              </div>
              <div className="mt-1 text-body font-medium text-foreground">{starterLabel}</div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-3xl border border-border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ModelCapabilitiesEditor
              disabled={props.disabled}
              value={draft.capabilities}
              onChange={(capabilities) =>
                props.onDraftChange((current) => ({ ...current, capabilities }))
              }
              translate={translate}
            />
            <div className="grid gap-4 rounded-2xl border border-border/80 bg-muted/20 p-4">
              <div className="text-body font-semibold text-foreground">
                {translate("content_library:MODELS_SECTION_DEFAULTS")}
              </div>
              <ModelRoutingEditor
                disabled={props.disabled}
                mode={draft.routingMode}
                pattern={draft.routingPattern}
                onModeChange={(routingMode) =>
                  props.onDraftChange((current) => ({ ...current, routingMode }))
                }
                onPatternChange={(routingPattern) =>
                  props.onDraftChange((current) => ({ ...current, routingPattern }))
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
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ModelFieldsEditor
              disabled={props.disabled}
              value={draft.fieldSchemaText}
              onChange={(fieldSchemaText) =>
                props.onDraftChange((current) => ({ ...current, fieldSchemaText }))
              }
              translate={translate}
            />
            <ModelRelationsEditor
              disabled={props.disabled}
              value={draft.relationSchemaText}
              onChange={(relationSchemaText) =>
                props.onDraftChange((current) => ({ ...current, relationSchemaText }))
              }
              translate={translate}
            />
          </div>
        </section>
      </div>

      <aside className="rounded-3xl border border-border bg-muted/25 p-5">
        <div className="text-title3 text-foreground">
          {translate("content_library:MODELS_IMPACT_TITLE")}
        </div>
        <div className="mt-1 text-footnote text-label-secondary">
          {translate("content_library:MODELS_IMPACT_DESC")}
        </div>

        <div className="mt-4 rounded-2xl border border-border/80 bg-card p-3">
          <div className="text-footnote uppercase tracking-[0.18em] text-label-secondary">
            {translate("content_library:MODELS_IMPACT_STATUS_TITLE")}
          </div>
          <div className="mt-2 text-body font-medium text-foreground">
            {hasDraftState
              ? translate("content_library:MODELS_IMPACT_STATUS_WARN")
              : translate("content_library:MODELS_IMPACT_STATUS_CLEAN")}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_FIELDS")} {impact.fields}
          </ImpactTag>
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_RELATIONS")} {impact.relations}
          </ImpactTag>
          <ImpactTag>
            {translate("content_library:MODELS_IMPACT_CAPABILITIES")} {impact.capabilities}
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

        <div className="mt-4 grid gap-3 rounded-2xl border border-border/80 bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {translate("content_library:MODELS_IMPACT_USAGE_RECORDS")}
            </span>
            <span className="text-body font-medium text-foreground">0</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {translate("content_library:MODELS_IMPACT_USAGE_ROUTES")}
            </span>
            <span className="text-body font-medium text-foreground">0</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {translate("content_library:MODELS_IMPACT_USAGE_PRESENTATIONS")}
            </span>
            <span className="text-body font-medium text-foreground">0</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {translate("content_library:MODELS_IMPACT_USAGE_PUBLISH")}
            </span>
            <span className="text-body font-medium text-foreground">0</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
