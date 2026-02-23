import { useTranslation } from "react-i18next";

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
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked)}
          className="size-3.5 rounded border"
        />
        <span className="text-muted-foreground">{label}</span>
      </label>
    );
  }

  if (field.kind === "select" && field.validation?.options) {
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="h-7 flex-1 rounded border bg-transparent px-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="" />
          {field.validation.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {resolveLocalizedValue(opt.label, VIEWER_CTX) ?? opt.value}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType = field.kind === "number" ? "number" : field.kind === "color" ? "color" : "text";

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <input
        type={inputType}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(field.key, inputType === "number" ? Number(e.target.value) : e.target.value)
        }
        className="h-7 flex-1 rounded border bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
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
      <p className="text-xs text-muted-foreground">
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
      <p className="text-xs font-medium text-muted-foreground">
        {resolveLocalizedValue(manifest.label, VIEWER_CTX) ?? blockType}
      </p>
      {manifest.attributes.map((field) => (
        <FieldInput key={field.key} field={field} value={data[field.key]} onChange={handleChange} />
      ))}
    </div>
  );
}
