import { useTranslation } from "react-i18next";

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
      <p className="text-xs font-medium text-muted-foreground">
        {t("content_pages:EDITOR_V2_INSPECTOR_DESIGN_TITLE", { defaultValue: "Design" })}
      </p>
      {DESIGN_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{key}</span>
          <input
            type={COLOR_FIELDS.has(key) ? "color" : "text"}
            value={String(data[key] ?? "")}
            onChange={(e) => console.log("design.patch", key, e.target.value)}
            className="h-7 flex-1 rounded border bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      ))}
    </div>
  );
}
