import { useTranslation } from "react-i18next";
import { Input } from "antd";

import type { EditorInspectorLayout } from "@celestial/site-editor-protocol";

const LAYOUT_KEYS = [
  "width",
  "minWidth",
  "maxWidth",
  "height",
  "minHeight",
  "maxHeight",
  "margin",
  "padding",
  "paddingX",
  "paddingY",
  "gap",
  "display",
  "direction",
  "wrap",
  "justifyContent",
  "alignItems",
] as const;

export function InspectorLayout({ data }: { data: EditorInspectorLayout }) {
  const { t } = useTranslation(["content_pages"]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-label-secondary">
        {t("content_pages:EDITOR_V2_INSPECTOR_LAYOUT_TITLE", { defaultValue: "Layout" })}
      </p>
      {LAYOUT_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            value={String(data[key] ?? "")}
            onChange={(e) => console.log("layout.patch", key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
