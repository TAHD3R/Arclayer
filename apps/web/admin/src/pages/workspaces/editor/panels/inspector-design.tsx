import { Input } from "antd";

import type { EditorInspectorDesign } from "@celestial/site-editor-protocol";

import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";

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
  const patchSelection = useEditorSelectionPatch();

  return (
    <div className="flex flex-col gap-2">
      {DESIGN_KEYS.map((key) => (
        <label key={key} className="flex items-center gap-2 text-caption">
          <span className="w-24 shrink-0 text-label-secondary">{key}</span>
          <Input
            size="small"
            type={COLOR_FIELDS.has(key) ? "color" : "text"}
            value={String(data[key] ?? "")}
            onChange={(e) =>
              void patchSelection("design", { [key]: e.target.value }, { commit: "debounced" })
            }
          />
        </label>
      ))}
    </div>
  );
}
