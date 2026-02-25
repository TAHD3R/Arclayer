import { useTranslation } from "react-i18next";
import { Input } from "antd";

import type { EditorInspectorDesign } from "@celestial/site-editor-protocol";

const DESIGN_KEYS = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderStyle",
  "borderWidth",
  "borderRadius",
  "boxShadow",
  "opacity",
] as const;

const COLOR_FIELDS = new Set(["color", "backgroundColor", "borderColor"]);

export function InspectorDesign({ data }: { data: EditorInspectorDesign }) {
  const { t } = useTranslation(["content_pages"]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-label-secondary">
        {t("content_pages:EDITOR_V2_INSPECTOR_DESIGN_TITLE", { defaultValue: "Design" })}
      </p>
      {DESIGN_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            type={COLOR_FIELDS.has(key) ? "color" : "text"}
            value={String(data[key] ?? "")}
            onChange={(e) => console.log("design.patch", key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
