import { useTranslation } from "react-i18next";
import { Input, InputNumber, Checkbox, Select } from "antd";

import {
  CORE_BLOCK_MANIFESTS,
  resolveLocalizedValue,
  type FieldDefinition,
  type ViewerContext,
} from "@celestial/site-block-protocol";
import type { EditorInspectorComponent } from "@celestial/site-editor-protocol";

const VIEWER_CTX: ViewerContext = { locale: "zh-CN", fallbackLocale: "en-US" };

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const label = resolveLocalizedValue(field.label, VIEWER_CTX) ?? field.key;

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-caption">
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked)}
        />
        <span className="text-label-secondary">{label}</span>
      </label>
    );
  }

  if (field.kind === "select" && field.validation?.options) {
    const options = field.validation.options.map((opt) => ({
      value: opt.value,
      label: resolveLocalizedValue(opt.label, VIEWER_CTX) ?? opt.value,
    }));

    return (
      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">{label}</span>
        <Select
          size="small"
          className="flex-1"
          value={value as string | undefined}
          onChange={(val) => onChange(field.key, val)}
          options={options}
          allowClear
        />
      </label>
    );
  }

  if (field.kind === "number") {
    return (
      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">{label}</span>
        <InputNumber
          size="small"
          className="flex-1"
          value={value as number | undefined}
          onChange={(val) => onChange(field.key, val)}
        />
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 text-caption">
      <span className="w-24 shrink-0 text-label-secondary">{label}</span>
      <Input
        size="small"
        type={field.kind === "color" ? "color" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(field.key, e.target.value)}
      />
    </label>
  );
}

export function InspectorComponent({
  blockType,
  data,
}: {
  blockType: string;
  data: EditorInspectorComponent;
}) {
  const { t } = useTranslation(["content_pages"]);
  const manifest = CORE_BLOCK_MANIFESTS.find((m) => m.type === blockType);

  if (!manifest) {
    return (
      <p className="text-caption text-label-secondary">
        {t("content_pages:EDITOR_V2_INSPECTOR_NO_MANIFEST", {
          defaultValue: "No manifest for {{type}}",
          type: blockType,
        })}
      </p>
    );
  }

  const handleChange = (key: string, val: unknown) => {
    console.log("component.patch", key, val);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-label-secondary">
        {resolveLocalizedValue(manifest.label, VIEWER_CTX) ?? blockType}
      </p>
      {manifest.attributes.map((field) => (
        <FieldInput key={field.key} field={field} value={data[field.key]} onChange={handleChange} />
      ))}
    </div>
  );
}
