import { Button, Input, Select, Tag } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CreateContentModelInput } from "@/api/content-models";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { SettingDialog } from "@celestial/ui/setting-dialog";

import {
  CONTENT_MODEL_CAPABILITY_LABEL_KEYS,
  CONTENT_MODEL_CATEGORY_LABEL_KEYS,
  CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS,
} from "./content-model-labels";
import {
  buildCreateContentModelInput,
  CONTENT_MODEL_TEMPLATE_PRESETS,
  getContentModelTemplatePreset,
  type ContentModelTemplateId,
  type ContentModelTemplatePreset,
} from "./content-model-templates";

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

function buildInitialForm(translate: TranslateFn): CreateContentModelInput {
  return buildCreateContentModelInput(getContentModelTemplatePreset("custom"), translate);
}

function buildTemplateButtonClass(selected: boolean): string {
  if (selected) {
    return "rounded-2xl border border-primary bg-primary/5 p-4 text-left transition-colors";
  }
  return "rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30";
}

function translateKind(kind: CreateContentModelInput["kind"], translate: TranslateFn): string {
  const option = MODEL_KIND_OPTIONS.find((item) => item.value === kind);
  return option ? translate(option.labelKey) : kind;
}

function TemplatePicker(props: {
  disabled?: boolean;
  onSelect: (templateId: ContentModelTemplateId) => void;
  selectedTemplateId: ContentModelTemplateId;
  translate: TranslateFn;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {CONTENT_MODEL_TEMPLATE_PRESETS.map((preset) => {
        const selected = preset.id === props.selectedTemplateId;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={props.disabled}
            className={buildTemplateButtonClass(selected)}
            onClick={() => props.onSelect(preset.id)}
          >
            <div className="text-body font-medium text-foreground">
              {props.translate(preset.titleKey)}
            </div>
            <div className="mt-1 text-footnote text-label-secondary">
              {props.translate(preset.summaryKey)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ModelContractPreview(props: {
  form: CreateContentModelInput;
  preset: ContentModelTemplatePreset;
  translate: TranslateFn;
}) {
  const categoryLabel = props.form.category
    ? props.translate(CONTENT_MODEL_CATEGORY_LABEL_KEYS[props.form.category])
    : null;
  const editorLabel = props.form.defaultEditor
    ? props.translate(CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS[props.form.defaultEditor])
    : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="text-body font-medium text-foreground">
        {props.translate("content_library:MODELS_PREVIEW_TITLE")}
      </div>
      <div className="mt-1 text-footnote text-label-secondary">
        {props.form.description || props.translate(props.preset.descriptionKey)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {categoryLabel ? <Tag className="m-0 rounded-md px-2 py-1">{categoryLabel}</Tag> : null}
        {editorLabel ? <Tag className="m-0 rounded-md px-2 py-1">{editorLabel}</Tag> : null}
        <Tag className="m-0 rounded-md px-2 py-1">
          {translateKind(props.form.kind, props.translate)}
        </Tag>
      </div>
      <div className="mt-4 grid gap-1.5">
        <div className="text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_PREVIEW_CAPABILITIES")}
        </div>
        <div className="flex flex-wrap gap-2">
          {(props.form.capabilities ?? []).length ? (
            props.form.capabilities?.map((capability) => (
              <Tag key={capability} variant="filled" className="m-0 rounded-md px-2 py-1">
                {props.translate(CONTENT_MODEL_CAPABILITY_LABEL_KEYS[capability])}
              </Tag>
            ))
          ) : (
            <div className="text-footnote text-label-secondary">
              {props.translate("content_library:MODELS_PREVIEW_CAPABILITIES_EMPTY")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelKindSelect(props: {
  disabled?: boolean;
  kind: CreateContentModelInput["kind"];
  onChange: (kind: CreateContentModelInput["kind"]) => void;
  translate: TranslateFn;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="font-semibold text-foreground">
        {props.translate("content_library:MODELS_FIELD_KIND_LABEL")}
      </label>
      <div className="text-footnote text-label-secondary">
        {props.translate("content_library:MODELS_FIELD_KIND_DESC")}
      </div>
      <Select
        value={props.kind}
        options={MODEL_KIND_OPTIONS.map((item) => ({
          value: item.value,
          label: props.translate(item.labelKey),
        }))}
        onChange={props.onChange}
        disabled={props.disabled}
        getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
      />
    </div>
  );
}

function ModelIdentityFields(props: {
  disabled?: boolean;
  form: CreateContentModelInput;
  onKeyChange: (value: string) => void;
  onNameChange: (value: string) => void;
  translate: TranslateFn;
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_FIELD_NAME_LABEL")}
        </label>
        <div className="text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_FIELD_NAME_DESC")}
        </div>
        <Input
          autoFocus
          value={props.form.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          placeholder={props.translate("content_library:MODELS_FIELD_NAME_PLACEHOLDER")}
          disabled={props.disabled}
        />
      </div>

      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_FIELD_KEY_LABEL")}
        </label>
        <div className="text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_FIELD_KEY_DESC")}
        </div>
        <Input
          value={props.form.key}
          onChange={(event) => props.onKeyChange(event.target.value)}
          placeholder={props.translate("content_library:MODELS_FIELD_KEY_PLACEHOLDER")}
          disabled={props.disabled}
        />
      </div>
    </>
  );
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

function CreateContentModelDialogBody(props: {
  disabled?: boolean;
  form: CreateContentModelInput;
  selectedPreset: ContentModelTemplatePreset;
  selectedTemplateId: ContentModelTemplateId;
  onKindChange: (kind: CreateContentModelInput["kind"]) => void;
  onKeyChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onTemplateSelect: (templateId: ContentModelTemplateId) => void;
  translate: TranslateFn;
}) {
  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_FIELD_TEMPLATE_LABEL")}
        </label>
        <div className="text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_FIELD_TEMPLATE_DESC")}
        </div>
      </div>

      <TemplatePicker
        disabled={props.disabled}
        selectedTemplateId={props.selectedTemplateId}
        onSelect={props.onTemplateSelect}
        translate={props.translate}
      />

      <ModelContractPreview
        form={props.form}
        preset={props.selectedPreset}
        translate={props.translate}
      />

      <ModelIdentityFields
        form={props.form}
        disabled={props.disabled}
        onNameChange={props.onNameChange}
        onKeyChange={props.onKeyChange}
        translate={props.translate}
      />

      {props.selectedTemplateId === "custom" ? (
        <ModelKindSelect
          kind={props.form.kind}
          disabled={props.disabled}
          onChange={props.onKindChange}
          translate={props.translate}
        />
      ) : null}
    </div>
  );
}

export function CreateContentModelDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateContentModelInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<ContentModelTemplateId>("custom");
  const [form, setForm] = useState<CreateContentModelInput>(() => buildInitialForm((key) => key));

  useEffect(() => {
    if (!props.open) return;
    setSelectedTemplateId("custom");
    setForm(buildInitialForm((key) => t(key)));
  }, [props.open]);

  const selectedPreset = useMemo(
    () => getContentModelTemplatePreset(selectedTemplateId),
    [selectedTemplateId],
  );
  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return form.key.trim().length > 0 && form.name.trim().length > 0;
  }, [form.key, form.name, props.confirmLoading]);
  const handleTemplateSelect = (templateId: ContentModelTemplateId) => {
    setSelectedTemplateId(templateId);
    setForm(
      buildCreateContentModelInput(getContentModelTemplatePreset(templateId), (key) => t(key)),
    );
  };
  const handleSubmit = async () => {
    await props.onConfirm({
      ...form,
      key: form.key.trim(),
      name: form.name.trim(),
    });
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
      <CreateContentModelDialogBody
        form={form}
        disabled={props.confirmLoading}
        selectedPreset={selectedPreset}
        selectedTemplateId={selectedTemplateId}
        onTemplateSelect={handleTemplateSelect}
        onNameChange={(name) => setForm((current) => ({ ...current, name }))}
        onKeyChange={(key) => setForm((current) => ({ ...current, key }))}
        onKindChange={(kind) => setForm((current) => ({ ...current, kind }))}
        translate={t}
      />
    </SettingDialog>
  );
}
