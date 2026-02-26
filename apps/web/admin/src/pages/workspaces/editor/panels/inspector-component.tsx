import { useTranslation } from "react-i18next";
import { Input, InputNumber, Checkbox, Select } from "antd";

import {
  CORE_BLOCK_MANIFESTS,
  resolveLocalizedValue,
  type FieldDefinition,
  type ViewerContext,
  type LocalizedValue,
} from "@celestial/site-block-protocol";
import type { EditorInspectorComponent } from "@celestial/site-editor-protocol";

import {
  useEditorSelectionPatch,
  type EditorSelectionPatchCommitMode,
} from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";
import { useViewerContext } from "@/pages/workspaces/editor/hooks/use-viewer-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isLocalizedString(value: unknown): value is LocalizedValue<string> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (v === undefined) continue;
    if (typeof v !== "string") return false;
  }
  return true;
}

function safeStringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function FieldInput({
  field,
  value,
  onChange,
  viewerCtx,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (key: string, val: unknown, commit: EditorSelectionPatchCommitMode) => void;
  viewerCtx: ViewerContext;
}) {
  const label = resolveLocalizedValue(field.label, viewerCtx) ?? field.key;

  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-caption">
        <Checkbox
          checked={Boolean(value)}
          onChange={(e) => onChange(field.key, e.target.checked, "immediate")}
        />
        <span className="text-label-secondary">{label}</span>
      </label>
    );
  }

  if (field.kind === "text") {
    const localized = isLocalizedString(value) ? value : null;
    const displayValue = localized
      ? (resolveLocalizedValue(localized, viewerCtx) ?? "")
      : String(value ?? "");

    return (
      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">{label}</span>
        <Input
          size="small"
          value={displayValue}
          onChange={(e) => {
            const nextRaw = e.target.value;
            if (localized) {
              onChange(
                field.key,
                {
                  ...(localized as Record<string, string>),
                  [viewerCtx.locale]: nextRaw,
                },
                "debounced",
              );
              return;
            }
            onChange(field.key, nextRaw, "debounced");
          }}
        />
      </label>
    );
  }

  if (field.kind === "select" && field.validation?.options) {
    const options = field.validation.options.map((opt) => ({
      value: opt.value,
      label: resolveLocalizedValue(opt.label, viewerCtx) ?? opt.value,
    }));

    return (
      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">{label}</span>
        <Select
          size="small"
          className="flex-1"
          value={value as string | undefined}
          onChange={(val) => onChange(field.key, val, "immediate")}
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
          onChange={(val) => onChange(field.key, val, "debounced")}
        />
      </label>
    );
  }

  return (
    <label className="flex items-center gap-2 text-caption">
      <span className="w-24 shrink-0 text-label-secondary">{label}</span>
      {field.kind === "array" ||
      field.kind === "object" ||
      field.kind === "json" ||
      field.kind === "richtext" ||
      field.kind === "reference" ||
      field.kind === "media" ? (
        <Input.TextArea
          size="small"
          value={safeStringifyValue(value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
          readOnly
        />
      ) : (
        <Input
          size="small"
          type={field.kind === "color" ? "color" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(field.key, e.target.value, "debounced")}
        />
      )}
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
  const patchSelection = useEditorSelectionPatch();
  const viewerCtx = useViewerContext();
  const manifest = CORE_BLOCK_MANIFESTS.find((m) => m.type === blockType);

  if (!manifest) {
    return (
      <p className="text-caption text-label-secondary">
        {t("content_pages:EDITOR_INSPECTOR_NO_MANIFEST", { type: blockType })}
      </p>
    );
  }

  const handleChange = (key: string, val: unknown, commit: EditorSelectionPatchCommitMode) => {
    void patchSelection("component", { [key]: val }, { commit });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-label-secondary">
        {resolveLocalizedValue(manifest.label, viewerCtx) ?? blockType}
      </p>
      {manifest.attributes.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={data[field.key]}
          onChange={handleChange}
          viewerCtx={viewerCtx}
        />
      ))}
    </div>
  );
}
